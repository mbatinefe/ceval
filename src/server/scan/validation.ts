import {
  markets,
  type Box,
  type Market,
  type Product,
  type Offer,
  type Mode,
  type ModelCandidate,
} from "../../shared/scan.ts";
import {
  isMultipack,
  packageSizeConfirmed,
} from "../../shared/package-size.ts";
import { ScanError } from "./errors.ts";
import { modelIdentityParts } from "../../shared/model-identity.ts";
export const MAX_FRAME_BYTES = 200_000;
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ScanError(
      "invalid_data",
      "The analysis returned an unreadable result.",
      502,
    );
  return value as Record<string, unknown>;
}
export function text(value: unknown, max = 160): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
export function marketOf(value: unknown): Market {
  if (typeof value !== "string" || !Object.hasOwn(markets, value))
    throw new ScanError(
      "invalid_market",
      "Choose a supported shopping market.",
      400,
    );
  return value as Market;
}
export function modeOf(value: unknown): Mode {
  if (value !== "buy" && value !== "resale")
    throw new ScanError("invalid_mode", "Choose buying or resale.", 400);
  return value;
}
export function validateFrame(value: unknown): string {
  const invalid = () =>
    new ScanError(
      "invalid_frame",
      "Use a clear JPEG frame no larger than 1024 pixels per side.",
      400,
    );
  if (
    typeof value !== "string" ||
    !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value) ||
    value.length > (MAX_FRAME_BYTES * 4) / 3 + 40
  )
    throw invalid();
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(value.slice(23)), (c) => c.charCodeAt(0));
  } catch {
    throw invalid();
  }
  if (
    bytes.length > MAX_FRAME_BYTES ||
    bytes[0] !== 255 ||
    bytes[1] !== 216 ||
    bytes.at(-2) !== 255 ||
    bytes.at(-1) !== 217
  )
    throw invalid();
  for (let offset = 2; offset + 9 < bytes.length;) {
    if (bytes[offset] !== 255) throw invalid();
    const marker = bytes[offset + 1];
    const length = bytes[offset + 2] * 256 + bytes[offset + 3];
    if (length < 2 || offset + length + 2 > bytes.length) throw invalid();
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      const height = bytes[offset + 5] * 256 + bytes[offset + 6];
      const width = bytes[offset + 7] * 256 + bytes[offset + 8];
      if (!width || !height || width > 1024 || height > 1024) throw invalid();
      return value;
    }
    offset += length + 2;
  }
  throw invalid();
}
export function parseProducts(
  value: unknown,
  referenceIds: string[] = [],
): Omit<Product, "id">[] {
  const claimedReferences = new Set<number>();
  const input = record(value).products;
  if (!Array.isArray(input) || input.length > 3)
    throw new ScanError(
      "invalid_data",
      "The analysis returned an unreadable result.",
      502,
    );
  return input.map((item) => {
    const p = record(item);
    const box = record(p.box);
    const coords = [box.x, box.y, box.width, box.height];
    if (
      coords.some(
        (n) => typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 1,
      ) ||
      Number(box.width) <= 0 ||
      Number(box.height) <= 0 ||
      Number(box.x) + Number(box.width) > 1.01 ||
      Number(box.y) + Number(box.height) > 1.01
    )
      throw new ScanError(
        "invalid_data",
        "Product positions could not be read.",
        502,
      );
    const candidates: ModelCandidate[] = [];
    const seen = new Set<string>();
    for (const entry of Array.isArray(p.candidates)
      ? p.candidates.slice(0, 15)
      : []) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const candidate = record(entry);
      const parsed = {
        brand: text(candidate.brand, 80),
        model: text(candidate.model, 100),
        variant: text(candidate.variant, 160),
        reason: text(candidate.reason, 240),
      };
      if (!parsed.brand || !parsed.model || !parsed.reason) continue;
      const key = JSON.stringify([
        parsed.brand,
        parsed.model,
        parsed.variant,
      ]).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(parsed);
      if (candidates.length === 5) break;
    }
    const confidence =
      typeof p.confidence === "number" && p.confidence >= 0 && p.confidence <= 1
        ? p.confidence
        : 0;
    const index = p.previousReferenceIndex;
    const previousProductId =
      Number.isInteger(index) &&
      Number(index) >= 0 &&
      Number(index) < referenceIds.length &&
      !claimedReferences.has(Number(index))
        ? referenceIds[Number(index)]
        : undefined;
    if (previousProductId) claimedReferences.add(Number(index));
    return {
      ...(previousProductId ? { previousProductId } : {}),
      brand: text(p.brand, 80),
      model: text(p.model, 100),
      variant: text(p.variant),
      label: text(p.label) || "Unidentified product",
      confidence: candidates.length ? Math.min(confidence, 0.59) : confidence,
      ...(candidates.length ? { candidates } : {}),
      box: box as Box,
      shelfPriceMinor:
        Number.isSafeInteger(p.shelfPriceMinor) &&
        Number(p.shelfPriceMinor) > 0 &&
        Number(p.shelfPriceMinor) < 100_000_000
          ? Number(p.shelfPriceMinor)
          : null,
      shelfCurrency:
        typeof p.shelfCurrency === "string" &&
        /^[A-Z]{3}$/.test(p.shelfCurrency)
          ? p.shelfCurrency
          : null,
    };
  });
}
export function safeUrl(value: unknown): string | null {
  try {
    const url = new URL(String(value));
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname) ||
      /(^|\.)(localhost|local|internal|test|invalid|example)$/.test(
        url.hostname,
      )
    )
      return null;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}
export function containsIdentity(evidence: string, identity: string): boolean {
  evidence = evidence.replace(/[™®©]/g, "");
  identity = identity.replace(/[™®©]/g, "");
  const tokens = identity.match(/[\p{L}\p{N}]+/gu);
  if (!tokens?.length) return false;
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${tokens.join("[\\s-]*")}(?![\\p{L}\\p{N}])`,
    "iu",
  ).test(evidence);
}
export function containsModel(evidence: string, model: string): boolean {
  const normalize = (value: string) =>
    value
      .replace(/[™®©]/g, "")
      .normalize("NFKC")
      .replace(
        /\b(\d{1,2}(?:\.\d)?)\s*(?:["″]|[-\s]*inch(?:es)?\b)/gi,
        "$1 inch",
      )
      .replace(/[(),]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const normalized = normalize(evidence);
  const identity = modelIdentityParts(model);
  if (identity) {
    const reference = normalized
      .toLowerCase()
      .replace(/(?:\b(?:usd|gbp|try|tl)\b\s*[$£₺]?|[$£₺])\s*\d[\d.,]*/g, " ")
      .replace(/\b\d[\d.,]*\s*(?:(?:usd|gbp|try|tl)\b|[$£₺])/g, " ")
      .replace(/\b(macbook)[\s\p{Pd}]+(pro|air)\b/gu, "$1 $2")
      .replace(/\b(m\d{1,2})[\s\p{Pd}]+(pro|max|ultra)\b/gu, "$1 $2");
    const groups = [
      /\bmacbook (?:pro|air)\b/g,
      /\b\d{1,2}(?:\.\d)? inch\b/g,
      /\bm\d{1,2}(?: (?:pro|max|ultra))?\b/g,
      /\b20\d{2}\b/g,
    ];
    return groups.every((pattern, index) => {
      const values = new Set(reference.match(pattern) ?? []);
      return values.size === 1 && values.has(identity[index]);
    });
  }
  if (containsIdentity(normalized, normalize(model))) return true;
  // Parenthesized specifications may move in listing titles; every qualifier still has to match.
  const parts = model.split(/[(),]/).map(normalize).filter(Boolean);
  return (
    parts.length > 1 &&
    parts.every((part) => containsIdentity(normalized, part))
  );
}
function marketplaceUrl(url: string): boolean {
  return /(^|\.)(ebay\.(com|co\.uk)|facebook\.com|mercari\.com|offerup\.com|craigslist\.org|gumtree\.com|sahibinden\.com|letgo\.com)$/.test(
    new URL(url).hostname,
  );
}
function containsPrice(
  evidence: string,
  priceMinor: number,
  market: Market,
): boolean {
  const number =
    market === "TR"
      ? "((?:\\d{1,3}(?:\\.\\d{3})+|\\d+)(?:,\\d{1,2})?)"
      : "((?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d{1,2})?)";
  const symbol =
    market === "US"
      ? "(?:USD\\s*\\$?|US\\$|\\$)"
      : market === "GB"
        ? "(?:GBP\\s*£?|£)"
        : "(?:TRY|TL|₺)";
  const patterns = [
    new RegExp(`${symbol}\\s*${number}(?!\\d|[.,]\\d)`, "gi"),
    new RegExp(`(?<![\\d.,])${number}\\s*${symbol}(?![A-Za-z])`, "gi"),
  ];
  return patterns.some((pattern) =>
    [...evidence.matchAll(pattern)].some((match) => {
      const amount =
        market === "TR"
          ? match[1].replace(/\./g, "").replace(",", ".")
          : match[1].replace(/,/g, "");
      return Math.round(Number(amount) * 100) === priceMinor;
    }),
  );
}
export type Source = { url: string; title: string; snippet: string };
export function validateOffers(
  value: unknown,
  sources: Source[],
  product: Product,
  market: Market,
  mode: Mode,
): Offer[] {
  const raw = record(value).offers;
  if (!Array.isArray(raw))
    throw new ScanError(
      "invalid_data",
      "Price search returned an unreadable result.",
      502,
    );
  const accepted: Offer[] = [];
  for (const item of raw.slice(0, 8)) {
    if (!item || typeof item !== "object") continue;
    const o = record(item);
    const url = safeUrl(o.url);
    const source = sources.find((s) => safeUrl(s.url) === url);
    if (
      !url ||
      !source ||
      o.currency !== markets[market].currency ||
      !Number.isSafeInteger(o.priceMinor) ||
      Number(o.priceMinor) <= 0 ||
      Number(o.priceMinor) > 100_000_000
    )
      continue;
    const evidence = `${source.title} ${source.snippet}`;
    if (isMultipack(evidence)) continue;
    if (
      /\b(per month|monthly|installment|financing|sold out|out of stock|unavailable|expired|members? only|with coupon|after rebate|starting at|replacement|accessories|accessory|compatible with|ear pads|earpads|bundle|auction|bids?|for parts|not working|from\s*[$£₺])\b/i.test(
        evidence,
      )
    )
      continue;
    if (
      market === "US" &&
      /\b(CAD|AUD|NZD|SGD|HKD)\b|CA\$|AU\$/i.test(evidence)
    )
      continue;
    if (
      !containsModel(evidence, product.model) ||
      !containsIdentity(evidence, product.brand)
    )
      continue;
    if (!containsPrice(evidence, Number(o.priceMinor), market)) continue;
    const saleStatusEvidence = evidence
      .replace(/\bsold\s+(?:(?:and\s+shipped\s+)?by|separately)\b/gi, "")
      .replace(
        /(?<![\d.,$£₺])\b\d[\d,]*\+?\s+(?:(?:units?|items?)\s+)?sold\b/gi,
        "",
      )
      .replace(/\b(?:not|never)\s+(?:(?:yet|been)\s+)?sold\b/gi, "");
    const sold =
      /\b(sold on|sold for|completed sale|satıldı)\b/i.test(
        saleStatusEvidence,
      ) &&
      !/\b(unsold|not|never|no)\b.{0,40}\b(sold|completed|sale)\b/i.test(
        evidence,
      );
    if (
      mode === "buy" &&
      (sold ||
        /\bsold\b/i.test(saleStatusEvidence) ||
        !["retail", "asking"].includes(String(o.kind)))
    )
      continue;
    const kind =
      mode === "buy"
        ? o.kind === "asking" || marketplaceUrl(url)
          ? "asking"
          : "retail"
        : sold && o.kind === "sold"
          ? "sold"
          : "asking";
    const condition = /\b(refurbished|renewed|yenilenmiş)\b/i.test(evidence)
      ? "refurbished"
      : /\b(used|pre-owned|ikinci el)\b/i.test(evidence)
        ? "used"
        : /\b(brand new|new condition|sıfır)\b/i.test(evidence)
          ? "new"
          : "unknown";
    if (
      mode === "resale" &&
      !sold &&
      !marketplaceUrl(url) &&
      condition !== "used" &&
      condition !== "refurbished"
    )
      continue;
    const match =
      product.identification !== "user_selected" &&
      product.confidence >= 0.85 &&
      Boolean(product.variant) &&
      containsIdentity(evidence, product.variant) &&
      packageSizeConfirmed(
        evidence,
        [product.model, product.variant, product.label].join(" "),
      )
        ? "exact"
        : "possible";
    if (!accepted.some((a) => a.url === url))
      accepted.push({
        title: text(source.title, 180),
        url,
        priceMinor: Number(o.priceMinor),
        currency: markets[market].currency,
        condition,
        kind,
        match,
        evidence,
      });
  }
  return accepted.sort((a, b) => a.priceMinor - b.priceMinor).slice(0, 5);
}
