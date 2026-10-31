import { markets, type Market } from "../../shared/scan.ts";
import type { VisualCandidate } from "../../shared/visual-search.ts";
import { ScanError } from "../scan/errors.ts";
import { text } from "../scan/validation.ts";
import { sourceUrl } from "./product-sources.ts";
export function lensKey(env: Env): string | undefined {
  const value: unknown = Reflect.get(env, "SERPAPI_API_KEY");
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
export const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export function candidateImageUrl(value: unknown): string | null {
  try {
    const url = new URL(typeof value === "string" ? value : "");
    return url.protocol === "https:" &&
      !url.port &&
      !url.username &&
      !url.password &&
      /^encrypted-tbn[0-9]\.gstatic\.com$/.test(url.hostname) &&
      url.pathname === "/images" &&
      url.searchParams.has("q") &&
      url.href.length <= 2048
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function parseLensMatches(
  value: unknown,
  market: Market,
): VisualCandidate[] {
  const raw = obj(value).visual_matches;
  if (!Array.isArray(raw)) return [];
  const matches: VisualCandidate[] = [];
  for (const item of raw.slice(0, 60)) {
    const row = obj(item),
      title = text(row.title, 220),
      url = sourceUrl(text(row.link, 2048), market);
    if (!title || !url || matches.some((match) => match.url === url)) continue;
    const thumbnail = candidateImageUrl(row.thumbnail);
    const amount = obj(row.price),
      currency = text(amount.currency, 8).toUpperCase();
    const minor =
      typeof amount.extracted_value === "number"
        ? Math.round(amount.extracted_value * 100)
        : 0;
    const canPrice =
      row.in_stock !== false &&
      currency === markets[market].currency &&
      Number.isSafeInteger(minor) &&
      minor > 0 &&
      minor <= 100_000_000 &&
      !/\b(sold out|out of stock|auction|bids?|per month|installment|from|starting at)\b/i.test(
        title,
      );
    const condition = /refurbished|renewed/i.test(String(row.condition))
      ? "refurbished"
      : /used|pre-owned/i.test(String(row.condition))
        ? "used"
        : /^new$/i.test(String(row.condition))
          ? "new"
          : "unknown";
    const marketplace =
      /(^|\.)(ebay\.com|facebook\.com|mercari\.com|offerup\.com|craigslist\.org)$/.test(
        new URL(url).hostname,
      );
    matches.push({
      id: crypto.randomUUID(),
      title,
      url,
      source: new URL(url).hostname.replace(/^www\./, ""),
      ...(thumbnail ? { thumbnail } : {}),
      assessment: "unreviewed",
      reason: "Found by image search. Exact model unconfirmed.",
      ...(canPrice
        ? {
            price: {
              priceMinor: minor,
              currency,
              evidenceType: "search_result" as const,
              kind:
                marketplace || condition !== "new"
                  ? ("asking" as const)
                  : ("retail" as const),
              condition,
            },
          }
        : {}),
    });
    if (matches.length === 8) break;
  }
  return matches;
}
export async function boundedBytes(
  response: Response,
  maximum: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("empty response");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maximum) {
        await reader.cancel();
        throw new Error("response too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
async function lensJson(url: string, init: RequestInit) {
  const response = await fetch(url, { ...init, redirect: "error" });
  if (!response.ok) {
    await response.body?.cancel();
    throw new ScanError(
      "visual_provider_error",
      response.status === 429
        ? "Image search is busy or its limit is reached. Try again later."
        : "Image search is temporarily unavailable. Try again later.",
      503,
    );
  }
  const result = obj(
    JSON.parse(
      new TextDecoder().decode(await boundedBytes(response, 1_000_000)),
    ),
  );
  if (result.error)
    throw new ScanError(
      "visual_provider_error",
      "Image search could not complete. Try again later.",
      502,
    );
  return result;
}
export async function lensMatches(
  env: Env,
  image: string,
  market: Market,
  signal?: AbortSignal,
): Promise<VisualCandidate[]> {
  const key = lensKey(env);
  if (!key)
    throw new ScanError(
      "visual_unavailable",
      "Image search is not connected yet. You can still scan labels and search known models.",
      503,
    );
  const deadline = AbortSignal.timeout(25000),
    requestSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  try {
    const bytes = Uint8Array.from(atob(image.slice(23)), (c) =>
      c.charCodeAt(0),
    );
    const body = new FormData();
    body.set("api_key", key);
    body.set("image", new Blob([bytes], { type: "image/jpeg" }), "product.jpg");
    const upload = await lensJson("https://serpapi.com/image", {
      method: "POST",
      body,
      signal: requestSignal,
    });
    const id = text(upload.image_id, 200);
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error("invalid upload");
    const params = new URLSearchParams({
      engine: "google_lens",
      image_id: id,
      type: "visual_matches",
      country: market.toLowerCase(),
      hl: market === "TR" ? "tr" : "en",
      safe: "active",
      auto_crop: "false",
      api_key: key,
    });
    const data = await lensJson(`https://serpapi.com/search?${params}`, {
      signal: requestSignal,
    });
    return parseLensMatches(data, market);
  } catch (error) {
    if (error instanceof ScanError) throw error;
    throw new ScanError(
      "visual_search_failed",
      requestSignal.aborted
        ? "Image search stopped or took too long. Try again."
        : "Image search could not read this photo. Try a clearer view.",
      502,
    );
  }
}
export async function candidatePhoto(
  candidate: VisualCandidate,
  signal?: AbortSignal,
): Promise<string | null> {
  const url = candidateImageUrl(candidate.thumbnail);
  if (!url) return null;
  try {
    const deadline = AbortSignal.timeout(4000);
    const response = await fetch(url, {
      redirect: "error",
      signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
    });
    const mime = (response.headers.get("content-type") || "").split(";")[0];
    if (
      !response.ok ||
      !["image/jpeg", "image/png", "image/webp"].includes(mime)
    ) {
      await response.body?.cancel();
      return null;
    }
    const bytes = await boundedBytes(response, 200000);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return `data:${mime};base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}
