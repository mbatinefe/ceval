import {
  markets,
  type Market,
  type Mode,
  type Offer,
  type Product,
  type ProductSource,
} from "../../shared/scan.ts";
import {
  containsIdentity,
  containsModel,
  safeUrl,
  validateOffers,
} from "../scan/validation.ts";

// Exact public merchant hosts only. Every redirect passes the same check.
const hosts = new Set([
  "arzopa.com",
  "www.arzopa.com",
  "www.bose.com",
  "bose.com",
  "www.nintendo.com",
  "www.apple.com",
  "www.anker.com",
  "www.logitech.com",
  "electronics.sony.com",
  "www.sony.com",
  "www.jbl.com",
  "www.bestbuy.com",
  "www.walmart.com",
  "www.target.com",
  "www.amazon.com",
  "www.ebay.com",
  "www.backmarket.com",
  "www.bose.co.uk",
  "www.amazon.co.uk",
  "www.ebay.co.uk",
]);
const MAX_BYTES = 2_000_000;
type Json = Record<string, unknown>;
const obj = (value: unknown): Json =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : {};
const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const list = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : value ? [value] : [];
const schemaType = (value: unknown, name: string) =>
  list(value).some(
    (v) =>
      typeof v === "string" &&
      v.replace(/^https?:\/\/schema.org\//, "") === name,
  );

function allowedUrl(value: string, market: Market): string | null {
  const safe = safeUrl(value);
  if (!safe) return null;
  const url = new URL(safe);
  if (!hosts.has(url.hostname)) return null;
  let path: string;
  try {
    path = decodeURIComponent(url.pathname).toLowerCase();
  } catch {
    return null;
  }
  if (
    market === "US" &&
    (url.hostname.endsWith(".co.uk") ||
      /\/(?:[a-z]{2}-)?(?:uk|gb|ca|au|nz|sg|hk|tr|de|fr|jp)(?:\/|$)/.test(path))
  )
    return null;
  return safe;
}

function compatibleName(name: string, product: Product): boolean {
  if (!containsModel(name, product.model)) return false;
  // A family name alone cannot identify a newer generation or tier.
  const tokens = product.model.match(/[\p{L}\p{N}]+/gu);
  if (!tokens) return false;
  const suffix = name.match(
    new RegExp(
      `(?<![\\p{L}\\p{N}])${tokens.join("[\\s-]*")}\\s+(\\d+|pro|ultra|plus|ii|iii|iv)(?![\\p{L}\\p{N}])`,
      "iu",
    ),
  )?.[1];
  return (
    !suffix ||
    (/^\d+$/.test(suffix) &&
      new RegExp(`${suffix}\\s*(?:[- ]?inch|["″]|hz|gb|tb)`, "i").test(name))
  );
}

function compatibleVariant(item: Json, name: string, variant: string): boolean {
  if (!variant) return true;
  const normalize = (v: string) => v.toLowerCase().replace(/\bgrey\b/g, "gray");
  const evidence = normalize([name, str(item.color), str(item.size)].join(" "));
  return containsIdentity(evidence, normalize(variant));
}

function productOffers(
  item: Json,
  inheritedBrand: unknown,
  pageUrl: string,
  product: Product,
  market: Market,
  mode: Mode,
): Offer[] {
  const name = str(item.name);
  const brandValue = item.brand ?? inheritedBrand;
  const brand = str(brandValue) || str(obj(brandValue).name);
  if (
    !containsIdentity(`${brand} ${name}`, product.brand) ||
    !compatibleName(name, product) ||
    !compatibleVariant(item, name, product.variant)
  )
    return [];
  const offers = list(item.offers).map(obj);
  // Multiple unqualified prices are ambiguous; never pick the cheapest variant.
  if (new Set(offers.map((o) => `${o.priceCurrency}:${o.price}`)).size > 1)
    return [];
  const accepted: Offer[] = [];
  for (const offer of offers.slice(0, 8)) {
    if (
      !schemaType(offer["@type"], "Offer") ||
      offer.priceCurrency !== markets[market].currency
    )
      continue;
    if (
      !schemaType(offer.availability, "InStock") &&
      !schemaType(offer.availability, "LimitedAvailability")
    )
      continue;
    const amount = String(offer.price ?? "");
    if (!/^\d+(?:\.\d{1,2})?$/.test(amount)) continue;
    const priceMinor = Math.round(Number(amount) * 100);
    if (
      !Number.isSafeInteger(priceMinor) ||
      priceMinor <= 0 ||
      priceMinor > 100_000_000
    )
      continue;
    if (offer.priceValidUntil !== undefined) {
      const until = Date.parse(str(offer.priceValidUntil));
      if (!Number.isFinite(until) || until + 86_400_000 < Date.now()) continue;
    }
    const conditionValue = offer.itemCondition ?? item.itemCondition;
    const condition = schemaType(conditionValue, "NewCondition")
      ? "new condition"
      : schemaType(conditionValue, "UsedCondition")
        ? "used"
        : schemaType(conditionValue, "RefurbishedCondition")
          ? "refurbished"
          : "condition unknown";
    if (mode === "resale" && !["used", "refurbished"].includes(condition))
      continue;
    let url = pageUrl;
    if (offer.url !== undefined) {
      try {
        const resolved = new URL(str(offer.url), pageUrl);
        if (!str(offer.url) || resolved.origin !== new URL(pageUrl).origin)
          continue;
        url = allowedUrl(resolved.href, market) ?? "";
        if (!url) continue;
      } catch {
        continue;
      }
    }
    const amountText =
      market === "TR"
        ? (priceMinor / 100).toFixed(2).replace(".", ",")
        : (priceMinor / 100).toFixed(2);
    const evidence = `${brand} ${name}. ${str(item.color)} ${str(item.size)}. ${offer.priceCurrency} ${amountText}. ${condition}. In stock.`;
    const found = validateOffers(
      {
        offers: [
          {
            url,
            priceMinor,
            currency: offer.priceCurrency,
            kind: mode === "resale" ? "asking" : "retail",
          },
        ],
      },
      [{ url, title: name, snippet: evidence }],
      product,
      market,
      mode,
    );
    for (const result of found)
      accepted.push({ ...result, evidenceType: "product_page" });
  }
  return accepted;
}

/** Only merchant Product JSON-LD supplies price evidence; page prose is not executed. */
export function parsePageOffers(
  html: string,
  url: string,
  product: Product,
  market: Market,
  mode: Mode,
): Offer[] {
  if (!allowedUrl(url, market) || html.length > MAX_BYTES) return [];
  const accepted: Offer[] = [];
  let visited = 0;
  const walk = (value: unknown, depth = 0, inheritedBrand?: unknown) => {
    if (++visited > 500 || depth > 8) return;
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 100))
        walk(item, depth + 1, inheritedBrand);
      return;
    }
    const item = obj(value);
    if (schemaType(item["@type"], "Product"))
      accepted.push(
        ...productOffers(item, inheritedBrand, url, product, market, mode),
      );
    if (schemaType(item["@type"], "ProductGroup"))
      walk(item.hasVariant, depth + 1, item.brand);
    if (item["@graph"]) walk(item["@graph"], depth + 1);
    if (item.mainEntity) walk(item.mainEntity, depth + 1);
  };
  const scripts = html.matchAll(
    /<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi,
  );
  for (const match of scripts) {
    if (visited > 500) break;
    try {
      walk(JSON.parse(match[1]));
    } catch {
      /* Malformed structured data is not price evidence. */
    }
  }
  return accepted
    .filter((o, i) => accepted.findIndex((other) => other.url === o.url) === i)
    .slice(0, 5);
}

async function readPage(
  url: string,
  market: Market,
  signal: AbortSignal,
): Promise<{ html: string; url: string } | null> {
  for (let redirects = 0; redirects <= 2; redirects++) {
    if (!allowedUrl(url, market) || signal.aborted) return null;
    const response = await fetch(url, {
      redirect: "manual",
      signal,
      headers: { Accept: "text/html,application/xhtml+xml" },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get("location");
      if (!location) return null;
      url = new URL(location, url).href;
      continue;
    }
    if (
      !response.ok ||
      !/^(?:text\/html|application\/xhtml\+xml)\b/i.test(
        response.headers.get("content-type") ?? "",
      ) ||
      Number(response.headers.get("content-length")) > MAX_BYTES
    ) {
      await response.body?.cancel();
      return null;
    }
    const reader = response.body?.getReader();
    if (!reader) return null;
    const decoder = new TextDecoder();
    let html = "",
      bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES || signal.aborted) {
        await reader.cancel();
        return null;
      }
      html += decoder.decode(value, { stream: true });
    }
    return signal.aborted ? null : { html: html + decoder.decode(), url };
  }
  return null;
}

export async function retrievedPageOffers(
  sources: ProductSource[],
  product: Product,
  market: Market,
  mode: Mode,
  signal?: AbortSignal,
): Promise<Offer[]> {
  if (signal?.aborted) return [];
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, 8000);
  const urls = [
    ...new Set(
      sources
        .map((s) => allowedUrl(s.url, market))
        .filter((u): u is string => Boolean(u)),
    ),
  ].slice(0, 3);
  const results: Offer[][] = [];
  let next = 0;
  const worker = async () => {
    while (next < urls.length && !controller.signal.aborted) {
      const index = next++;
      try {
        const page = await readPage(urls[index], market, controller.signal);
        results[index] = page
          ? parsePageOffers(page.html, page.url, product, market, mode)
          : [];
      } catch {
        results[index] = [];
      }
    }
  };
  try {
    await Promise.all([worker(), worker()]);
    return results.flat();
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
