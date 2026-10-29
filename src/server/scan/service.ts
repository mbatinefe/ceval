import type { Comparison, Market, Mode, Product } from "../../shared/scan.ts";
import { recognizeFrame, searchOffers } from "../providers/meta.ts";
import { reserveScan } from "./budget.ts";
import { ScanError } from "./errors.ts";
import { MAX_FRAME_BYTES } from "./validation.ts";
export function capabilities(env: Env) {
  const hasKey = Boolean(env.META_API_KEY?.trim());
  const enabled = String(env.SCAN_ENABLED) === "true";
  return {
    analysisAvailable: hasKey && enabled,
    reason: !hasKey
      ? "Product analysis is not connected yet. You can preview your camera or video."
      : !enabled
        ? "Product analysis is temporarily paused. You can still preview your camera or video."
        : null,
    maxFrameBytes: MAX_FRAME_BYTES,
    maxVideoBytes: 150 * 1024 * 1024,
    maxVideoSeconds: 600,
  };
}
function requireProvider(env: Env) {
  if (!capabilities(env).analysisAvailable)
    throw new ScanError("provider_unavailable", capabilities(env).reason!, 503);
}
export async function digest(value: string) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
async function job<T>(
  env: Env,
  userId: string,
  kind: "recognize" | "compare",
  key: string,
  ttl: number,
  run: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  await env.DB.prepare("DELETE FROM scan_jobs WHERE expires_at < ?")
    .bind(now)
    .run();
  const id = crypto.randomUUID();
  const claimed = await env.DB.prepare(
    "INSERT INTO scan_jobs (id,user_id,kind,request_key,status,expires_at,created_at) VALUES (?,?,?,?,'pending',?,?) ON CONFLICT(user_id,kind,request_key) DO NOTHING RETURNING id",
  )
    .bind(id, userId, kind, key, now + ttl, now)
    .first();
  if (!claimed) {
    const previous = await env.DB.prepare(
      "SELECT status,result,created_at FROM scan_jobs WHERE user_id=? AND kind=? AND request_key=?",
    )
      .bind(userId, kind, key)
      .first<{ status: string; result: string | null; created_at: number }>();
    if (previous?.status === "done" && previous.result)
      return JSON.parse(previous.result) as T;
    if (previous?.status === "error")
      throw new ScanError(
        "recent_failure",
        "That analysis recently failed. Wait a minute before trying it again.",
        429,
      );
    throw new ScanError(
      "analysis_pending",
      "This frame or product is already being analyzed. Please wait.",
      409,
    );
  }
  try {
    requireProvider(env);
    await reserveScan(env, userId, kind);
    const result = await run();
    await env.DB.prepare(
      "UPDATE scan_jobs SET status='done',result=? WHERE id=?",
    )
      .bind(JSON.stringify(result), id)
      .run();
    return result;
  } catch (error) {
    await env.DB.prepare(
      "UPDATE scan_jobs SET status='error',expires_at=? WHERE id=?",
    )
      .bind(Date.now() + 60000, id)
      .run();
    throw error;
  }
}
export async function recognize(
  env: Env,
  userId: string,
  frame: string,
  market: Market,
  signal?: AbortSignal,
) {
  requireProvider(env);
  return job(
    env,
    userId,
    "recognize",
    await digest(`${market}:${frame}`),
    180000,
    async () => {
      const result = await recognizeFrame(env, frame, market, signal);
      const products: Product[] = [];
      for (const p of result) {
        const fingerprint = await digest(
          JSON.stringify([
            market,
            p.brand.toLowerCase(),
            p.model.toLowerCase(),
            p.variant.toLowerCase(),
            p.model ? "" : p.label.toLowerCase(),
          ]),
        );
        const product = { ...p, id: crypto.randomUUID() };
        const stored = await env.DB.prepare(
          "INSERT INTO scan_products (id,user_id,fingerprint,data,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id,fingerprint) DO UPDATE SET data=json_set(excluded.data, '$.id', scan_products.id),updated_at=excluded.updated_at RETURNING data",
        )
          .bind(
            product.id,
            userId,
            fingerprint,
            JSON.stringify(product),
            Date.now(),
          )
          .first<{ data: string }>();
        if (!stored)
          throw new ScanError(
            "storage_error",
            "Couldn’t retain this product. Please try again.",
            503,
          );
        products.push(JSON.parse(stored.data) as Product);
      }
      return { products, analyzedAt: Date.now() };
    },
  );
}
export async function compare(
  env: Env,
  userId: string,
  productId: string,
  mode: Mode,
  market: Market,
  signal?: AbortSignal,
): Promise<Comparison> {
  const row = await env.DB.prepare(
    "SELECT data,updated_at FROM scan_products WHERE id=? AND user_id=?",
  )
    .bind(productId, userId)
    .first<{ data: string; updated_at: number }>();
  if (!row) throw new ScanError("not_found", "Product not found.", 404);
  const product: Product = JSON.parse(row.data);
  if (!product.model || !product.brand || product.confidence < 0.85)
    throw new ScanError(
      "needs_label",
      "Move closer to the model label before searching prices.",
      422,
    );
  if (row.updated_at < Date.now() - 86400000)
    throw new ScanError(
      "needs_label",
      "Scan this product again for a fresh identification.",
      422,
    );
  return job(
    env,
    userId,
    "compare",
    await digest(
      JSON.stringify([
        productId,
        mode,
        market,
        product.shelfPriceMinor,
        product.shelfCurrency,
      ]),
    ),
    900000,
    async () => {
      const offers = await searchOffers(env, product, mode, market, signal);
      const result: Comparison = {
        id: crypto.randomUUID(),
        product,
        mode,
        market,
        offers,
        checkedAt: Date.now(),
        expiresAt: Date.now() + 900000,
        status: offers.length ? "found" : "no_evidence",
      };
      await env.DB.prepare(
        "INSERT INTO scan_comparisons (id,user_id,data,created_at) VALUES (?,?,?,?)",
      )
        .bind(result.id, userId, JSON.stringify(result), result.checkedAt)
        .run();
      return result;
    },
  );
}
