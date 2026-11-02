import {
  markets,
  type Comparison,
  type Offer,
  type Mode,
  type Market,
} from "../../shared/scan.ts";

export type OfferSummary = {
  offer: Offer;
  label: string;
  shortLabel: string;
  qualification: string;
  savingsMinor: number | null;
  checkedAt: number;
  expiresAt: number;
};

export function offerSummary(
  comparison?: Comparison,
  options: { includeExpired?: boolean } = {},
): OfferSummary | null {
  if (
    !comparison ||
    (!options.includeExpired && comparison.expiresAt <= Date.now())
  )
    return null;
  const offers = comparison.offers.filter(
    (offer) =>
      offer.currency === markets[comparison.market].currency &&
      (comparison.mode === "buy"
        ? offer.kind === "retail" || offer.kind === "asking"
        : offer.kind === "sold" || offer.kind === "asking"),
  );
  offers.sort((a, b) => {
    if (a.match !== b.match) return a.match === "exact" ? -1 : 1;
    if (comparison.mode === "buy" && a.kind !== b.kind)
      return a.kind === "retail" ? -1 : 1;
    if (comparison.mode === "resale" && a.kind !== b.kind)
      return a.kind === "sold" ? -1 : 1;
    if (comparison.mode === "buy" && a.kind === "retail") {
      if ((a.condition === "new") !== (b.condition === "new"))
        return a.condition === "new" ? -1 : 1;
      if (
        (a.evidenceType === "product_page") !==
        (b.evidenceType === "product_page")
      )
        return a.evidenceType === "product_page" ? -1 : 1;
    }
    return a.priceMinor - b.priceMinor;
  });
  const offer = offers[0];
  if (!offer) return null;
  const { product } = comparison;
  const difference =
    comparison.mode === "buy" &&
    offer.kind === "retail" &&
    offer.match === "exact" &&
    offer.condition === "new" &&
    offer.evidenceType !== "cited_summary" &&
    product.shelfCurrency === offer.currency &&
    product.shelfPriceMinor !== null
      ? product.shelfPriceMinor - offer.priceMinor
      : null;
  return {
    offer,
    checkedAt: comparison.checkedAt,
    expiresAt: comparison.expiresAt,
    shortLabel:
      offer.kind === "sold"
        ? "Reported sale"
        : offer.kind === "asking"
          ? "Asking"
          : offer.evidenceType === "cited_summary"
            ? "Search price"
            : "Online",
    qualification: [
      offer.match === "possible" ? "Possible match" : "",
      offer.condition === "new"
        ? ""
        : offer.condition === "unknown"
          ? "Check condition"
          : offer.condition[0].toUpperCase() + offer.condition.slice(1),
    ]
      .filter(Boolean)
      .join(" · "),
    label:
      offer.kind === "sold"
        ? "Reported sale"
        : offer.kind === "asking"
          ? "Asking price"
          : offer.evidenceType === "cited_summary"
            ? "Search-reported price"
            : offer.match === "exact" &&
                offer.condition === "new" &&
                offer.evidenceType === "product_page"
              ? "Lowest new price found"
              : "Online price",
    savingsMinor: difference !== null && difference > 0 ? difference : null,
  };
}

/** A photographed alternative has its own price, never savings on the scanned item. */
export function findSummary(
  row:
    | {
        comparison?: Comparison;
        visualSearch?: import("../../shared/visual-search.ts").VisualSearch;
      }
    | undefined,
  mode: Mode,
  market: Market,
  options: { includeExpired?: boolean } = {},
): OfferSummary | null {
  if (!row) return null;
  const comparison = row.comparison;
  const direct =
    comparison?.mode === mode && comparison.market === market
      ? offerSummary(comparison, options)
      : null;
  if (direct) return direct;
  const result = row.visualSearch;
  if (
    !result ||
    result.market !== market ||
    (result.mode ?? "buy") !== mode ||
    (!options.includeExpired && result.expiresAt <= Date.now())
  )
    return null;
  const candidate = result.candidates
    .filter(
      (c) =>
        c.assessment !== "unreviewed" &&
        c.price &&
        c.price.currency === markets[market].currency &&
        c.price.priceMinor > 0 &&
        (mode === "buy" || c.price.kind === "asking"),
    )
    .sort((a, b) => a.price!.priceMinor - b.price!.priceMinor)[0];
  if (!candidate?.price) return null;
  return {
    offer: {
      title: candidate.title,
      url: candidate.url,
      ...candidate.price,
      evidenceType:
        candidate.price.evidenceType === "product_page"
          ? "product_page"
          : "cited_summary",
      match: "possible",
      evidence: candidate.reason,
    },
    label:
      mode === "resale" ? "Similar item asking price" : "Similar item price",
    shortLabel: mode === "resale" ? "Similar · Asking" : "Similar",
    qualification: "Your item’s identity is not confirmed",
    savingsMinor: null,
    checkedAt: result.checkedAt,
    expiresAt: result.expiresAt,
  };
}
