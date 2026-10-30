import { markets, type Comparison, type Offer } from "../../shared/scan.ts";

export type OfferSummary = {
  offer: Offer;
  label: string;
  shortLabel: string;
  qualification: string;
  savingsMinor: number | null;
};

export function offerSummary(comparison?: Comparison): OfferSummary | null {
  if (!comparison || comparison.expiresAt <= Date.now()) return null;
  const offers = comparison.offers.filter(
    (offer) =>
      offer.currency === markets[comparison.market].currency &&
      (comparison.mode === "buy"
        ? offer.kind === "retail"
        : offer.kind === "sold" || offer.kind === "asking"),
  );
  offers.sort((a, b) => {
    if (comparison.mode === "resale" && a.kind !== b.kind)
      return a.kind === "sold" ? -1 : 1;
    if (a.match !== b.match) return a.match === "exact" ? -1 : 1;
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
            : "Online price",
    savingsMinor: difference !== null && difference > 0 ? difference : null,
  };
}
