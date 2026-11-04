import type { Market, Mode, Product } from "../../shared/scan.ts";
import type {
  VisualSearch,
  VisualCandidate,
} from "../../shared/visual-search.ts";
import { consumeLimit, LimitReached } from "../auth/limits.ts";
import { candidatePhoto } from "../providers/product-media.ts";
import {
  discoverProductsFromPhoto,
  rankVisualMatches,
} from "../providers/meta.ts";
import { applyVisualRanking } from "../providers/visual-ranking.ts";
import { retrievedPageOffers } from "../providers/product-pages.ts";
import { reserveScan, settleScan, finishScanReservation } from "./budget.ts";
import { capabilities, digest } from "./service.ts";
import { ScanError } from "./errors.ts";
import { validateFrame } from "./validation.ts";
export async function storedVisualSearch(
  env: Env,
  userId: string,
  productId: string,
  market: Market,
  mode: Mode = "buy",
) {
  const row = await env.DB.prepare(
    "SELECT data FROM scan_visual_matches WHERE user_id=? AND product_id=? AND market=? AND json_extract(data,'$.provider')='meta' AND json_extract(data,'$.version')=2",
  )
    .bind(userId, productId, market)
    .first<{ data: string }>();
  const result = row ? (JSON.parse(row.data) as VisualSearch) : null;
  return result && (result.mode ?? "buy") === mode ? result : null;
}
async function reserveVisualSearch(env: Env, userId: string) {
  try {
    await consumeLimit(env.DB, `visual:user:${userId}`, 240, 3600);
    await consumeLimit(env.DB, "visual:deployment:hour", 480, 3600);
  } catch (error) {
    if (error instanceof LimitReached)
      throw new ScanError(
        "visual_limit",
        "Image search allowance reached. Your previous matches are still available.",
        429,
      );
    throw error;
  }
}
async function verifyCandidatePrices(
  candidates: VisualCandidate[],
  observed: Product,
  market: Market,
  mode: Mode,
  signal?: AbortSignal,
) {
  const timeout = AbortSignal.timeout(8000),
    bounded = signal ? AbortSignal.any([signal, timeout]) : timeout;
  await Promise.all(
    candidates.slice(0, 3).map(async (candidate) => {
      if (
        !candidate.identity ||
        candidate.price?.evidenceType === "product_page" ||
        bounded.aborted
      )
        return;
      const product: Product = {
        ...observed,
        ...candidate.identity,
        identification: "user_selected",
        confidence: 0.5,
        label: candidate.title,
      };
      const offers = await retrievedPageOffers(
        [{ title: candidate.title, url: candidate.url }],
        product,
        market,
        mode,
        bounded,
        () => {
          delete candidate.price;
        },
      );
      const offer = offers[0];
      if (offer)
        candidate.price = {
          priceMinor: offer.priceMinor,
          currency: offer.currency,
          evidenceType: "product_page",
          kind: offer.kind === "retail" ? "retail" : "asking",
          condition: offer.condition,
        };
    }),
  );
}
export async function discoverVisualMatches(
  env: Env,
  userId: string,
  productId: string,
  market: Market,
  image: unknown,
  signal?: AbortSignal,
  mode: Mode = "buy",
): Promise<VisualSearch> {
  const row = await env.DB.prepare(
    "SELECT data FROM scan_products WHERE id=? AND user_id=?",
  )
    .bind(productId, userId)
    .first<{ data: string }>();
  if (!row) throw new ScanError("not_found", "Product not found.", 404);
  const saved = await env.DB.prepare(
    "SELECT id,thumbnail FROM scan_history WHERE user_id=? AND product_id=? ORDER BY updated_at DESC LIMIT 1",
  )
    .bind(userId, productId)
    .first<{ id: string; thumbnail: string | null }>();
  if (!saved)
    throw new ScanError(
      "needs_photo",
      "This find is no longer in your history. Scan it again to search by image.",
      422,
    );
  const cached = await storedVisualSearch(env, userId, productId, market, mode);
  if (cached && cached.expiresAt > Date.now()) return cached;
  if (!capabilities(env).analysisAvailable)
    throw new ScanError(
      "provider_unavailable",
      "Product analysis is temporarily unavailable.",
      503,
    );
  const photo = image ?? saved.thumbnail;
  if (!photo)
    throw new ScanError(
      "needs_photo",
      "This find has no saved photo. Scan it again to search by image.",
      422,
    );
  const frame = validateFrame(photo),
    product = JSON.parse(row.data) as Product;
  const key = await digest(`visual-meta-v4:${productId}:${market}:${mode}`),
    now = Date.now(),
    id = crypto.randomUUID();
  await env.DB.prepare(
    "DELETE FROM scan_jobs WHERE user_id=? AND kind='visual' AND expires_at<?",
  )
    .bind(userId, now)
    .run();
  const prior = await env.DB.prepare(
    "SELECT result FROM scan_jobs WHERE user_id=? AND kind='visual' AND request_key=? AND status='done' AND expires_at>? AND result IS NOT NULL",
  )
    .bind(userId, key, now)
    .first<{ result: string }>();
  if (prior) return JSON.parse(prior.result) as VisualSearch;
  const claim = await env.DB.prepare(
    "INSERT INTO scan_jobs (id,user_id,kind,request_key,status,expires_at,created_at,product_id) VALUES (?,?,'visual',?,'pending',?,?,?) ON CONFLICT(user_id,kind,request_key) DO NOTHING RETURNING id",
  )
    .bind(id, userId, key, now + 180000, now, productId)
    .first();
  if (!claim) {
    const completed = await storedVisualSearch(
      env,
      userId,
      productId,
      market,
      mode,
    );
    if (completed && completed.expiresAt > Date.now()) return completed;
    throw new ScanError(
      "visual_pending",
      "This item is already being checked. Wait a moment before trying again.",
      409,
    );
  }
  try {
    // Leave time for provider settlement before the three-minute job lease expires.
    const deadline = AbortSignal.timeout(130000);
    signal = signal ? AbortSignal.any([signal, deadline]) : deadline;
    signal.throwIfAborted();
    await reserveVisualSearch(env, userId);
    const discover = async (previous?: VisualCandidate[]) => {
      const reservation = await reserveScan(
        env,
        userId,
        "compare",
        `${id}:${previous ? "recovery" : "discovery"}`,
      );
      try {
        return await discoverProductsFromPhoto(
          env,
          frame,
          product,
          market,
          signal,
          (micros) => settleScan(env, reservation, micros),
          previous,
          mode,
        );
      } finally {
        await finishScanReservation(env, reservation);
      }
    };
    let candidates = await discover();
    let ranking: VisualSearch["ranking"] = candidates.length
      ? "unavailable"
      : "no_matches";
    if (!signal?.aborted) {
      const images = new Map<string, string>();
      // Two at a time bounds open connections and total downloaded bytes.
      const loadImages = async (rows: VisualCandidate[]) => {
        for (let i = 0; i < rows.length && !signal?.aborted; i += 2) {
          await Promise.all(
            rows.slice(i, i + 2).map(async (candidate) => {
              const image = await candidatePhoto(candidate, signal);
              if (image) images.set(candidate.id, image);
            }),
          );
        }
      };
      await loadImages(candidates);
      if (!images.size && !signal?.aborted) {
        try {
          const original = candidates;
          const recovered = await discover(original);
          candidates = [...recovered, ...candidates]
            .filter(
              (candidate, index, all) =>
                all.findIndex((other) => other.url === candidate.url) === index,
            )
            .slice(0, 8);
          await loadImages(candidates);
          if (!images.size)
            candidates = [...original, ...recovered]
              .filter(
                (candidate, index, all) =>
                  all.findIndex((other) => other.url === candidate.url) ===
                  index,
              )
              .slice(0, 8);
        } catch {
          // Preserve first-pass evidence if recovery is unavailable or out of budget.
        }
        ranking = candidates.length ? "unavailable" : "no_matches";
      }
      if (images.size && !signal?.aborted) {
        let reservation: Awaited<ReturnType<typeof reserveScan>> | undefined;
        try {
          reservation = await reserveScan(
            env,
            userId,
            "compare",
            `${id}:ranking`,
          );
          const reserved = reservation;
          const visible = candidates.filter((candidate) =>
            images.has(candidate.id),
          );
          const unseen = candidates.filter(
            (candidate) => !images.has(candidate.id),
          );
          const value = await rankVisualMatches(
            env,
            frame,
            product,
            visible,
            images,
            signal,
            (micros) => settleScan(env, reserved, micros),
          );
          candidates = [...applyVisualRanking(visible, value), ...unseen];
          ranking = "meta";
        } catch {
          // Retrieved photos remain useful when the ranking provider is unavailable.
          ranking = "unavailable";
        } finally {
          if (reservation) await finishScanReservation(env, reservation);
        }
      }
    }
    candidates = candidates.slice(0, 5);
    if (!signal?.aborted)
      await verifyCandidatePrices(candidates, product, market, mode, signal);
    const result: VisualSearch = {
      provider: "meta",
      version: 2,
      productId,
      market,
      mode,
      candidates,
      ranking,
      checkedAt: Date.now(),
      expiresAt: Date.now() + 1800000,
    };
    const stored = await env.DB.prepare(
      "INSERT INTO scan_visual_matches (user_id,product_id,market,data,updated_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM scan_history WHERE user_id=? AND product_id=? AND id=?) ON CONFLICT(user_id,product_id,market) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at RETURNING product_id",
    )
      .bind(
        userId,
        productId,
        market,
        JSON.stringify(result),
        result.checkedAt,
        userId,
        productId,
        saved.id,
      )
      .first();
    if (!stored)
      throw new ScanError(
        "not_found",
        "This find was removed while image search was running.",
        404,
      );
    await env.DB.prepare(
      "UPDATE scan_jobs SET status='done',expires_at=?,result=? WHERE id=?",
    )
      .bind(result.expiresAt, JSON.stringify(result), id)
      .run();
    return result;
  } catch (error) {
    await env.DB.prepare(
      "UPDATE scan_jobs SET status='error',expires_at=? WHERE id=?",
    )
      .bind(Date.now() + 60000, id)
      .run();
    if (error instanceof ScanError) throw error;
    throw new ScanError(
      "visual_search_failed",
      "Image search could not finish. Try again in a minute.",
      502,
    );
  }
}
