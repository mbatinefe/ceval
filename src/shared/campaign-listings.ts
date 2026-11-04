export type CampaignOffer = {
  merchant: string;
  title: string;
  url: string;
  image: string;
  condition: string;
  priceMinor?: number;
  currency: "USD";
  checkedAt: string;
  availability: "available" | "unavailable" | "unknown";
};
export type CampaignMatch = "model" | "similar";

// Browser image sources only; these do not extend server-side fetch permissions.
export const campaignImageSources = [
  "https://cgi.keh.com/media/catalog/product/",
  "https://storage.googleapis.com/mpb-platform-prod-media-service-prod-y1m8/",
  "https://lscoglobal.scene7.com/is/image/lscoglobal/",
  "https://www.converse.com/dw/image/",
  "https://www.karenwalker.com/cdn/shop/",
  "https://shophorne.com/cdn/shop/",
  "https://www.anglepoise.com/usa/wp-content/uploads/",
];

export function campaignPrice(
  offer: CampaignOffer,
  now = Date.now(),
): string | null {
  const age = now - Date.parse(offer.checkedAt);
  if (
    !Number.isFinite(age) ||
    age < 0 ||
    age >= 7 * 86400000 ||
    offer.availability !== "available" ||
    offer.currency !== "USD" ||
    !Number.isSafeInteger(offer.priceMinor) ||
    (offer.priceMinor ?? 0) <= 0
  )
    return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: offer.currency,
    minimumFractionDigits: offer.priceMinor! % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(offer.priceMinor! / 100);
}
export function campaignMatchLabel(match: CampaignMatch) {
  return match === "model" ? "Model match" : "Similar match";
}
