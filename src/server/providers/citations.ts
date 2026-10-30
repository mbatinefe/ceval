import type { Market, Mode, Offer, Product } from "../../shared/scan.ts";
import {
  containsIdentity,
  safeUrl,
  text,
  validateOffers,
  type Source,
} from "../scan/validation.ts";

export type AnswerBlock = { text: string; annotations: unknown[] };
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export function citedOffers(
  blocks: AnswerBlock[],
  sources: Source[],
  product: Product,
  market: Market,
  mode: Mode,
): Offer[] {
  const offers: Offer[] = [];
  for (const block of blocks) {
    const characters = Array.from(block.text);
    let offset = 0;
    for (const line of block.text.split("\n")) {
      const start = offset;
      offset += Array.from(line).length + 1;
      let row: Record<string, unknown>;
      try {
        row = object(JSON.parse(line));
      } catch {
        continue;
      }
      const url = safeUrl(row.url);
      const source = sources.find((s) => safeUrl(s.url) === url);
      if (
        !url ||
        !source ||
        source.snippet.trim() ||
        !containsIdentity(source.title, product.brand) ||
        !containsIdentity(source.title, product.model)
      )
        continue;
      const cited = block.annotations.some((value) => {
        const annotation = object(value);
        const from = annotation.start_index,
          to = annotation.end_index;
        return (
          annotation.type === "url_citation" &&
          safeUrl(annotation.url) === url &&
          Number.isSafeInteger(from) &&
          Number.isSafeInteger(to) &&
          Number(from) >= 0 &&
          Number(from) <= start &&
          Number(to) >= offset - 1 &&
          Number(to) <= characters.length &&
          characters.slice(Number(from), Number(to)).join("").trim() ===
            line.trim()
        );
      });
      const supportingText = text(row.supportingText, 2000);
      if (
        !cited ||
        !supportingText ||
        !containsIdentity(supportingText, product.model)
      )
        continue;
      const [found] = validateOffers(
        { offers: [{ ...row, kind: mode === "resale" ? "asking" : row.kind }] },
        [{ ...source, snippet: supportingText }],
        product,
        market,
        mode,
      );
      if (!found || offers.some((o) => o.url === url)) continue;
      // Cited summaries are model reports, not independently retrieved retailer text.
      found.evidenceType = "cited_summary";
      found.kind = mode === "resale" ? "asking" : "retail";
      found.match =
        product.confidence >= 0.85 &&
        Boolean(product.variant) &&
        containsIdentity(source.title, product.variant)
          ? "exact"
          : "possible";
      found.condition = /\b(refurbished|renewed)\b/i.test(source.title)
        ? "refurbished"
        : /\b(used|pre-owned)\b/i.test(source.title)
          ? "used"
          : /\b(brand new|new condition)\b/i.test(source.title)
            ? "new"
            : "unknown";
      offers.push(found);
    }
  }
  return offers.sort((a, b) => a.priceMinor - b.priceMinor).slice(0, 5);
}
