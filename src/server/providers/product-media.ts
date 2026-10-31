import type { Market, ProductSource } from "../../shared/scan.ts";
import type { VisualCandidate } from "../../shared/visual-search.ts";
import { text } from "../scan/validation.ts";
import {
  merchantHosts,
  readProductPage,
  merchantPageUrl,
} from "./product-pages.ts";
import { sourceUrl } from "./product-sources.ts";

export const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

// Only public merchant and reviewed product-image CDN origins. Redirects are rejected.
export const productImageHosts = new Set([
  ...merchantHosts,
  "cdn.shopify.com",
  "m.media-amazon.com",
  "i5.walmartimages.com",
  "i.ebayimg.com",
  "pisces.bbystatic.com",
  "target.scene7.com",
  "assets.bose.com",
  "assets.nintendo.com",
  "store.storeimages.cdn-apple.com",
  "resource.logitech.com",
  "media.flixcar.com",
  "www.sony.co.uk",
  "images.samsung.com",
]);
export function candidateImageUrl(value: unknown): string | null {
  try {
    const url = new URL(typeof value === "string" ? value : "");
    if (
      url.protocol !== "https:" ||
      url.port ||
      url.username ||
      url.password ||
      !productImageHosts.has(url.hostname) ||
      url.href.length > 2048
    )
      return null;
    // Shopify serves the same source image at a bounded width.
    if (
      url.hostname === "cdn.shopify.com" ||
      url.pathname.startsWith("/cdn/shop/")
    )
      url.searchParams.set("width", "480");
    return url.href;
  } catch {
    return null;
  }
}
export function searchCandidates(
  sources: ProductSource[],
  market: Market,
): VisualCandidate[] {
  const rows: VisualCandidate[] = [];
  for (const source of sources.slice(0, 40)) {
    const url = sourceUrl(source.url, market),
      title = text(source.title, 220);
    if (!url || !title || rows.some((row) => row.url === url)) continue;
    const parsed = new URL(url);
    const marketplace =
      ((parsed.hostname === "www.facebook.com" ||
        parsed.hostname === "facebook.com") &&
        /^\/marketplace\/item\/\d+/.test(parsed.pathname)) ||
      ((parsed.hostname === "www.mercari.com" ||
        parsed.hostname === "mercari.com") &&
        /^\/us\/item\//.test(parsed.pathname)) ||
      ((parsed.hostname === "offerup.com" ||
        parsed.hostname === "www.offerup.com") &&
        /^\/item\/detail\//.test(parsed.pathname));
    if (!merchantPageUrl(url, market) && !marketplace) continue;
    if (
      parsed.pathname === "/" ||
      /^\/(?:collections|blogs?|pages|search|faq|support|reviews?)(?:\/|$)/i.test(
        parsed.pathname,
      ) ||
      /\.pdf$/i.test(parsed.pathname)
    )
      continue;
    rows.push({
      id: crypto.randomUUID(),
      title,
      url,
      source: new URL(url).hostname.replace(/^www\./, ""),
      assessment: "unreviewed",
      reason:
        "Found by Meta web search. Photo comparison unavailable; exact model unconfirmed.",
    });
  }
  // Prefer merchants whose product pages can be retrieved, preserving search order.
  return rows
    .sort(
      (a, b) =>
        Number(Boolean(merchantPageUrl(b.url, market))) -
        Number(Boolean(merchantPageUrl(a.url, market))),
    )
    .slice(0, 8);
}
const decode = (value: string) =>
  value.replace(
    /&(?:amp|quot|apos|lt|gt|#39|#x27);/gi,
    (entity) =>
      ({
        "&amp;": "&",
        "&quot;": '"',
        "&apos;": "'",
        "&lt;": "<",
        "&gt;": ">",
        "&#39;": "'",
        "&#x27;": "'",
      })[entity.toLowerCase()] ?? entity,
  );
export function candidateFromPage(
  candidate: VisualCandidate,
  html: string,
  pageUrl: string,
): VisualCandidate {
  const products: Record<string, unknown>[] = [];
  let visited = 0;
  const walk = (value: unknown, depth = 0) => {
    if (++visited > 500 || depth > 8) return;
    if (Array.isArray(value)) {
      for (const row of value.slice(0, 100)) walk(row, depth + 1);
      return;
    }
    const row = obj(value),
      types = Array.isArray(row["@type"]) ? row["@type"] : [row["@type"]];
    if (
      types.some((type) =>
        /^(?:https?:\/\/schema.org\/)?Product$/.test(String(type)),
      )
    )
      products.push(row);
    if (row["@graph"]) walk(row["@graph"], depth + 1);
    if (row.mainEntity) walk(row.mainEntity, depth + 1);
  };
  for (const match of html.matchAll(
    /<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi,
  )) {
    try {
      walk(JSON.parse(match[1]));
    } catch {
      /* Invalid structured data is not evidence. */
    }
  }
  const metas = new Map<string, string>();
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = new Map<string, string>();
    for (const attr of match[0].matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs))
      attrs.set(attr[1].toLowerCase(), decode(attr[3]));
    const key = attrs.get("property") ?? attrs.get("name");
    if (key && attrs.has("content"))
      metas.set(key.toLowerCase(), attrs.get("content")!);
  }
  const product = products.length === 1 ? products[0] : null;
  const rawImages = product
    ? Array.isArray(product.image)
      ? product.image
      : [product.image]
    : [];
  // Multi-product pages cannot attach an arbitrary variant photo to a model title.
  if (products.length <= 1 && (product || metas.get("og:type") === "product"))
    rawImages.push(metas.get("og:image"));
  let thumbnail: string | null = null;
  for (const raw of rawImages) {
    const value =
      typeof raw === "string"
        ? raw
        : text(obj(raw).url || obj(raw).contentUrl, 2048);
    try {
      thumbnail = candidateImageUrl(new URL(decode(value || ""), pageUrl).href);
    } catch {
      continue;
    }
    if (thumbnail && value) break;
    thumbnail = null;
  }
  const name = product && text(product.name, 220),
    brand =
      product && (text(product.brand, 80) || text(obj(product.brand).name, 80));
  return {
    ...candidate,
    ...(name ? { title: `${brand || ""} ${name}`.trim().slice(0, 220) } : {}),
    ...(thumbnail ? { thumbnail } : {}),
  };
}
export async function retrieveCandidatePhotos(
  candidates: VisualCandidate[],
  market: Market,
  signal?: AbortSignal,
): Promise<VisualCandidate[]> {
  const timeout = AbortSignal.timeout(10000),
    bounded = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const result = [...candidates];
  let next = 0;
  const worker = async () => {
    while (next < result.length && !bounded.aborted) {
      const index = next++;
      try {
        const page = await readProductPage(result[index].url, market, bounded);
        if (page)
          result[index] = candidateFromPage(result[index], page.html, page.url);
      } catch {
        /* The source link remains useful if the merchant blocks page access. */
      }
    }
  };
  await Promise.all([worker(), worker()]);
  return result;
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
export async function candidatePhoto(
  candidate: VisualCandidate,
  signal?: AbortSignal,
): Promise<string | null> {
  const url = candidateImageUrl(candidate.thumbnail);
  if (!url) return null;
  try {
    const deadline = AbortSignal.timeout(4000);
    const response = await fetch(url, {
      redirect: "manual",
      headers: {
        "User-Agent": "CevalProductResearch/0.1",
        Accept: "image/jpeg,image/png,image/webp",
      },
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
    const bytes = await boundedBytes(response, 500000);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return `data:${mime};base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}
