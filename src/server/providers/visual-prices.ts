import type { Market, Mode, Product } from "../../shared/scan.ts";
import type { VisualCandidate } from "../../shared/visual-search.ts";
import { sourceUrl } from "./product-sources.ts";
import { citedOffers, type AnswerBlock } from "./citations.ts";
import { validateOffers, type Source } from "../scan/validation.ts";

/** Prices describe the retrieved listing; they do not identify the photographed item. */
export function candidatePrices(
  candidates: VisualCandidate[],
  blocks: AnswerBlock[],
  sources: Source[],
  market: Market,
  mode: Mode,
): VisualCandidate[] {
  const records: unknown[] = [];
  for (const block of blocks)
    for (const line of block.text.split("\n")) {
      try {
        const row = JSON.parse(line);
        if (row?.url) records.push(row);
      } catch {
        /* Only structured, sourced price lines are eligible. */
      }
    }
  return candidates.map((candidate) => {
    const product: Product = {
      id: candidate.id,
      brand: "",
      model: candidate.title,
      variant: "",
      label: candidate.title,
      confidence: 0,
      box: { x: 0, y: 0, width: 1, height: 1 },
      shelfPriceMinor: null,
      shelfCurrency: null,
    };
    const offers = [
      ...validateOffers({ offers: records }, sources, product, market, mode),
      ...citedOffers(blocks, sources, product, market, mode),
    ];
    const offer = offers.find(
      (o) => sourceUrl(o.url, market) === candidate.url,
    );
    return offer
      ? {
          ...candidate,
          price: {
            priceMinor: offer.priceMinor,
            currency: offer.currency,
            kind: offer.kind === "retail" ? "retail" : "asking",
            condition: offer.condition,
            evidenceType: "search_result",
          },
        }
      : candidate;
  });
}
