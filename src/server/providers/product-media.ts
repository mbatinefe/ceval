import type { Market, Mode, ProductSource } from "../../shared/scan.ts";
import type { VisualCandidate } from "../../shared/visual-search.ts";
import { text } from "../scan/validation.ts";
import {
  merchantHosts,
  readProductPage,
  merchantPageUrl,
  parsePageOffers,
} from "./product-pages.ts";
import { localizedProductUrl, sourceUrl } from "./product-sources.ts";

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
  "assets.bosecreative.com",
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
      /(?:global-og-image|samsung-logo|\/logos?\/)/i.test(url.pathname) ||
      url.href.length > 2048
    )
      return null;
    // Shopify serves the same source image at a bounded width.
    if (
      url.hostname === "cdn.shopify.com" ||
      url.pathname.startsWith("/cdn/shop/")
    )
      url.searchParams.set("width", "480");
    if (url.hostname === "assets.bosecreative.com") {
      url.searchParams.set("format", "jpg");
      url.searchParams.set("quality", "75");
      url.searchParams.set("io", "width:640,height:640,transform:fit");
    }
    if (
      url.hostname === "www.ikea.com" &&
      url.pathname.includes("/images/products/")
    )
      url.searchParams.set("f", "s");
    return url.href;
  } catch {
    return null;
  }
}
export function candidatePageUrl(value: string, market: Market): string | null {
  const safe = sourceUrl(value, market);
  if (!safe) return null;
  const url = new URL(safe);
  if (/^(?:www\.)?amazon\.(?:com|co\.uk)$/.test(url.hostname)) {
    const asin = url.pathname.match(
      /\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/i,
    )?.[1];
    if (asin) {
      url.pathname = `/dp/${asin.toUpperCase()}`;
      url.search = "";
    }
  }
  for (const key of [...url.searchParams.keys()])
    if (
      /^(?:srsltid|ref|tag|linkCode|camp|creative|sfmc_.+|cgid|bvrrp|bvstate|mc|campaign_id|ad_id|_fid|clkid|afid|cpng|lnm)$/i.test(
        key,
      )
    )
      url.searchParams.delete(key);
  return url.href;
}
export function officialProductHost(url: string): boolean {
  const host = new URL(url).hostname.replace(/^www\./, "");
  return [
    "arzopa.com",
    "bose.com",
    "nintendo.com",
    "apple.com",
    "anker.com",
    "logitech.com",
    "logi.com",
    "samsung.com",
    "sony.com",
    "electronics.sony.com",
    "jbl.com",
    "twiningsusa.com",
    "hanes.com",
    "ikea.com",
    "levi.com",
  ].includes(host);
}
export function searchCandidates(
  sources: ProductSource[],
  market: Market,
): VisualCandidate[] {
  const rows: VisualCandidate[] = [];
  for (const source of sources.slice(0, 40)) {
    const url = candidatePageUrl(source.url, market),
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
      [...parsed.searchParams.keys()].some((key) =>
        /^(?:q|query|search|keywords?|k)$/i.test(key),
      ) ||
      /^\/(?:collections|blogs?|pages|search|s|c|faq|support|help|pressroom|news|articles|reviews?)(?:\/|$)/i.test(
        parsed.pathname,
      ) ||
      /\/(?:searchpage\.jsp|questions|whatsnew|reviews?|news|articles?|support|help)(?:\/|$)/i.test(
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
        Number(officialProductHost(b.url)) * 2 +
        Number(Boolean(merchantPageUrl(b.url, market))) -
        (Number(officialProductHost(a.url)) * 2 +
          Number(Boolean(merchantPageUrl(a.url, market)))),
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
  market?: Market,
  mode: Mode = "buy",
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
        /^(?:https?:\/\/schema.org\/)?Product(?:Group)?$/.test(String(type)),
      )
    ) {
      // Some stores publish the same entity in multiple JSON-LD scripts.
      // Merge only matching IDs AND names; distinct products remain ambiguous.
      const entityId = (item: Record<string, unknown>) => {
        try {
          return text(item["@id"], 2048)
            ? new URL(text(item["@id"], 2048), pageUrl).href
            : "";
        } catch {
          return "";
        }
      };
      const id = entityId(row),
        name = text(row.name, 220).toLowerCase();
      const existing =
        id && name
          ? products.find(
              (item) =>
                entityId(item) === id &&
                text(item.name, 220).toLowerCase() === name,
            )
          : undefined;
      if (existing) {
        const values = (value: unknown) =>
          Array.isArray(value) ? value : value ? [value] : [];
        existing.image = [...values(existing.image), ...values(row.image)];
        existing.brand ||= row.brand;
      } else products.push(row);
    }
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
  const productPath =
    /\/(?:products?|p|dp|shop|store)\//i.test(new URL(pageUrl).pathname) ||
    /\.html$/i.test(new URL(pageUrl).pathname);
  const ogProduct =
    products.length === 0 &&
    productPath &&
    Boolean(metas.get("og:title")) &&
    merchantHosts.has(new URL(pageUrl).hostname);
  const rawImages = product
    ? Array.isArray(product.image)
      ? product.image
      : [product.image]
    : [];
  // Multi-product pages cannot attach an arbitrary variant photo to a model title.
  if (
    products.length <= 1 &&
    (product || ogProduct || metas.get("og:type") === "product")
  )
    rawImages.push(metas.get("og:image:secure_url"), metas.get("og:image"));
  const photos: string[] = [];
  for (const raw of rawImages.slice(0, 8)) {
    const value =
      typeof raw === "string"
        ? raw
        : text(obj(raw).url || obj(raw).contentUrl, 2048);
    if (!value) continue;
    try {
      const image = candidateImageUrl(new URL(decode(value), pageUrl).href);
      if (image && !photos.includes(image)) photos.push(image);
    } catch {
      /* Ignore malformed image URLs. */
    }
    if (photos.length === 3) break;
  }
  const name = product
      ? text(product.name, 220)
      : ogProduct
        ? text(metas.get("og:title"), 220)
        : "",
    brand =
      (product &&
        (text(product.brand, 80) || text(obj(product.brand).name, 80))) ||
      (new URL(pageUrl).hostname === "www.apple.com" &&
      /^\/shop\/buy-(?:airpods|mac|iphone|ipad|watch)(?:\/|$)/.test(
        new URL(pageUrl).pathname,
      )
        ? "Apple"
        : "");
  const offer =
    product && name && market && product["@type"] === "Product"
      ? parsePageOffers(
          html,
          pageUrl,
          {
            id: candidate.id,
            brand,
            model: name,
            variant: "",
            label: name,
            confidence: 0,
            box: { x: 0, y: 0, width: 1, height: 1 },
            shelfPriceMinor: null,
            shelfCurrency: null,
          },
          market,
          mode,
        )[0]
      : undefined;
  const { price: _oldPrice, ...withoutPrice } = candidate;
  return {
    ...withoutPrice,
    ...(!products.length &&
    ogProduct &&
    candidatePageUrl(candidate.url, market ?? "US") ===
      candidatePageUrl(pageUrl, market ?? "US") &&
    _oldPrice?.evidenceType === "search_result"
      ? { price: _oldPrice }
      : {}),
    ...(offer
      ? {
          price: {
            priceMinor: offer.priceMinor,
            currency: offer.currency,
            evidenceType: "product_page" as const,
            kind:
              offer.kind === "retail"
                ? ("retail" as const)
                : ("asking" as const),
            condition: offer.condition,
          },
        }
      : {}),
    ...(name
      ? {
          title:
            `${brand && !name.toLowerCase().includes(brand.toLowerCase()) ? brand : ""} ${name}`
              .trim()
              .slice(0, 220),
        }
      : {}),
    ...(photos.length ? { thumbnail: photos[0], photos } : {}),
  };
}
function linkedProducts(
  html: string,
  pageUrl: string,
  market: Market,
  category: string,
): ProductSource[] {
  const matchers = [
    /monitor|screen|display/i,
    /headphones?/i,
    /speakers?/i,
    /mouse|mice/i,
    /console|nintendo|switch/i,
    /power bank|charger/i,
  ];
  const categoryMatch = matchers.find((pattern) => pattern.test(category));
  if (!categoryMatch) return [];
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || html;
  const links: ProductSource[] = [];
  for (const anchor of main.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = anchor[1].match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2];
    if (!href) continue;
    try {
      const url = new URL(decode(href), pageUrl);
      if (
        url.origin !== new URL(pageUrl).origin ||
        !/\/(?:products|p|shop\/p)\/[^/]+/i.test(url.pathname)
      )
        continue;
      const title = decode(anchor[2].replace(/<[^>]+>/g, " "))
        .replace(/\s+/g, " ")
        .trim();
      if (
        !categoryMatch.test(`${title} ${url.pathname}`) ||
        /(?:replacement|carrying-case|screen-protector|ear-cushions|monitor-stand)/i.test(
          url.pathname,
        )
      )
        continue;
      const safe = candidatePageUrl(url.href, market);
      if (safe && !links.some((link) => link.url === safe))
        links.push({
          url: safe,
          title:
            title ||
            decodeURIComponent(url.pathname.split("/").pop()!).replaceAll(
              "-",
              " ",
            ),
        });
    } catch {
      /* Unsafe and malformed catalog links are ignored. */
    }
    if (links.length >= 12) break;
  }
  return links;
}
export async function retrieveCandidatePhotos(
  candidates: VisualCandidate[],
  market: Market,
  signal?: AbortSignal,
  discovery?: { sources: ProductSource[]; category: string; mode?: Mode },
): Promise<VisualCandidate[]> {
  const timeout = AbortSignal.timeout(14000),
    bounded = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const pages = new Map<string, { html: string; url: string }>();
  let result = [...candidates];
  if (discovery && !bounded.aborted) {
    const localized = [
      ...new Set(
        discovery.sources
          .map((source) => localizedProductUrl(source.url, market))
          .filter((url): url is string => Boolean(url)),
      ),
    ].slice(0, 2);
    const verified = await Promise.all(
      localized.map(async (url) => {
        try {
          const page = await readProductPage(
            url,
            market,
            AbortSignal.any([bounded, AbortSignal.timeout(4500)]),
          );
          if (!page) return null;
          const seed = searchCandidates(
            [{ url, title: discovery.category }],
            market,
          )[0];
          if (!seed) return null;
          const candidate = candidateFromPage(
            seed,
            page.html,
            page.url,
            market,
            discovery.mode,
          );
          if (!candidate.photos?.length && !candidate.price) return null;
          pages.set(url, page);
          return {
            ...candidate,
            reason:
              "Retrieved from the local manufacturer store. Photo comparison pending; product identity unconfirmed.",
          };
        } catch {
          // A missing or blocked local page never becomes a suggested listing.
          return null;
        }
      }),
    );
    const localCandidates = verified.filter(
      (candidate): candidate is NonNullable<typeof candidate> =>
        Boolean(candidate),
    );
    result = [
      ...localCandidates,
      ...result.filter(
        (candidate) =>
          !localCandidates.some((local) => local.url === candidate.url),
      ),
    ].slice(0, 8);
    const official = discovery.sources
      .map((source) => ({
        ...source,
        url: candidatePageUrl(source.url, market),
      }))
      .filter((source): source is ProductSource =>
        Boolean(
          source.url &&
          officialProductHost(source.url) &&
          merchantPageUrl(source.url, market),
        ),
      );
    const seed =
      official.find((source) =>
        /\/collections\/(?!all(?:[/?]|$))/.test(source.url),
      ) || official.find((source) => /\/products\//.test(source.url));
    if (seed)
      try {
        const page = await readProductPage(
          seed.url,
          market,
          AbortSignal.any([bounded, AbortSignal.timeout(3500)]),
        );
        if (page) {
          pages.set(seed.url, page);
          const links = linkedProducts(
            page.html,
            page.url,
            market,
            discovery.category,
          );
          const existing = new Map(
            result.map((candidate) => [candidate.url, candidate]),
          );
          result = searchCandidates(
            [...result.map((c) => ({ title: c.title, url: c.url })), ...links],
            market,
          ).map((candidate) => existing.get(candidate.url) || candidate);
        }
      } catch {
        /* Initial search candidates remain available when a catalog blocks retrieval. */
      }
  }
  let next = 0;
  const worker = async () => {
    while (next < result.length && !bounded.aborted) {
      const index = next++;
      try {
        const page =
          pages.get(result[index].url) ||
          (await readProductPage(result[index].url, market, bounded));
        if (page)
          result[index] = candidateFromPage(
            result[index],
            page.html,
            page.url,
            market,
            discovery?.mode,
          );
      } catch {
        /* Keep source links if individual product pages are unavailable. */
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
  const urls = [
    ...new Set(
      [candidate.thumbnail, ...(candidate.photos || [])]
        .map(candidateImageUrl)
        .filter((url): url is string => Boolean(url)),
    ),
  ].slice(0, 3);
  const deadline = AbortSignal.timeout(6000),
    bounded = signal ? AbortSignal.any([signal, deadline]) : deadline;
  for (const url of urls) {
    if (bounded.aborted) break;
    try {
      const response = await fetch(url, {
        redirect: "manual",
        headers: {
          "User-Agent": "CevalProductResearch/0.1",
          Accept: "image/jpeg,image/png,image/webp",
        },
        signal: bounded,
      });
      const mime = (response.headers.get("content-type") || "")
        .split(";")[0]
        .toLowerCase()
        .trim();
      if (
        !response.ok ||
        !["image/jpeg", "image/png", "image/webp"].includes(mime)
      ) {
        await response.body?.cancel();
        continue;
      }
      const bytes = await boundedBytes(response, 500000);
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      // Display the same image that Meta actually received when a fallback succeeds.
      candidate.thumbnail = url;
      return `data:${mime};base64,${btoa(binary)}`;
    } catch {
      /* Try another image from the same product page within the shared deadline. */
    }
  }
  return null;
}
