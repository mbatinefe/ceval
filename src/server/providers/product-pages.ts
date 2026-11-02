import {
  markets,
  type Market,
  type Mode,
  type Offer,
  type Product,
  type ProductSource,
} from "../../shared/scan.ts";
import { containsIdentity, validateOffers } from "../scan/validation.ts";

import {
  matchesModel,
  variantConflicts,
  containsVariant,
} from "./product-identity.ts";
import { sourceUrl } from "./product-sources.ts";

// Exact public merchant hosts only. Every redirect passes the same check.
export const merchantHosts = new Set([
  "arzopa.com",
  "www.arzopa.com",
  "www.bose.com",
  "bose.com",
  "www.nintendo.com",
  "www.apple.com",
  "www.anker.com",
  "www.logitech.com",
  "www.logi.com",
  "www.samsung.com",
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
  "efendina.com",
  "beautycarebag.com",
  "lujainbeauty.com",
  "twiningsusa.com",
  "www.twiningsusa.com",
  "www.hanes.com",
  "www.ikea.com",
  "www.kroger.com",
  "www.levi.com",
  "www.nordstrom.com",
  "www.walgreens.com",
  "www.cvs.com",
  "www.homedepot.com",
  "www.lowes.com",
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

export function merchantPageUrl(value: string, market: Market): string | null {
  const safe = sourceUrl(value, market);
  return safe && merchantHosts.has(new URL(safe).hostname) ? safe : null;
}

function compatibleVariant(item: Json, name: string, variant: string): boolean {
  if (!variant) return true;
  const evidence = [name, str(item.color), str(item.size)].join(" ");
  return (
    !variantConflicts(evidence, variant) && containsVariant(evidence, variant)
  );
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
    (Boolean(product.brand) &&
      !containsIdentity(`${brand} ${name}`, product.brand)) ||
    !matchesModel(name, product.model) ||
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
        url = merchantPageUrl(resolved.href, market) ?? "";
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
  onProduct?: () => void,
): Offer[] {
  if (!merchantPageUrl(url, market) || html.length > MAX_BYTES) return [];
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
    if (schemaType(item["@type"], "Product")) {
      onProduct?.();
      accepted.push(
        ...productOffers(item, inheritedBrand, url, product, market, mode),
      );
    }
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
  // A family with differently priced variants has no single verified price.
  if (
    new Set(accepted.map((offer) => `${offer.currency}:${offer.priceMinor}`))
      .size > 1
  )
    return [];
  return accepted
    .filter((o, i) => accepted.findIndex((other) => other.url === o.url) === i)
    .slice(0, 5);
}

export async function readProductPage(
  url: string,
  market: Market,
  signal: AbortSignal,
): Promise<{ html: string; url: string } | null> {
  for (let redirects = 0; redirects <= 2; redirects++) {
    if (!merchantPageUrl(url, market) || signal.aborted) return null;
    const response = await fetch(url, {
      redirect: "manual",
      signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "CevalProductResearch/0.1",
      },
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
  onChecked?: (urls: string[]) => void,
): Promise<Offer[]> {
  if (signal?.aborted) return [];
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, 8000);
  const urls = [
    ...new Set(
      sources
        .map((s) => merchantPageUrl(s.url, market))
        .filter((u): u is string => Boolean(u)),
    ),
  ].slice(0, 3);
  const results: Offer[][] = [];
  let next = 0;
  const worker = async () => {
    while (next < urls.length && !controller.signal.aborted) {
      const index = next++;
      try {
        const page = await readProductPage(
          urls[index],
          market,
          controller.signal,
        );
        let hasProduct = false;
        results[index] = page
          ? parsePageOffers(page.html, page.url, product, market, mode, () => {
              hasProduct = true;
            })
          : [];
        if (page && hasProduct) onChecked?.([urls[index], page.url]);
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
