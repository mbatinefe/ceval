import {
  campaignPrice,
  type CampaignOffer,
} from "../../shared/campaign-listings.ts";

export type PriceSummary = { range: string; detail: string };

const usd = (minor: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);

// Summarises only the offers that may still show a price, so an expired
// snapshot never turns into a range.
export function priceSummary(
  offers: CampaignOffer[],
  now = Date.now(),
): PriceSummary | null {
  const live = offers.filter(
    (offer) => campaignPrice(offer, now) !== null && offer.priceMinor,
  );
  if (!live.length) return null;
  const minors = live.map((offer) => offer.priceMinor!);
  const low = Math.min(...minors);
  const high = Math.max(...minors);
  const range =
    low === high ? usd(low) : `${usd(low)}–${usd(high).replace("$", "")}`;
  const kinds = new Set(live.map((offer) => offer.condition.split(" · ")[0]));
  const kind = kinds.size === 1 ? [...kinds][0] : "New and used";
  const where =
    live.length === 1 ? `at ${live[0].merchant}` : `from ${live.length} stores`;
  return { range, detail: `${kind} ${where}` };
}

export function checkedDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}
