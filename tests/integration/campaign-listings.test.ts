import { test } from "node:test";
import assert from "node:assert/strict";
import {
  campaignPrice,
  campaignMatchLabel,
  type CampaignOffer,
} from "../../src/shared/campaign-listings.ts";
const checkedAt = "2026-11-04T13:00:00.000Z";
const now = Date.parse(checkedAt);
const offer: CampaignOffer = {
  merchant: "Example merchant",
  title: "Nikon FM2 body",
  url: "https://example.com/products/fm2",
  image: "https://example.com/fm2.jpg",
  condition: "Used · Excellent · Body only",
  priceMinor: 55500,
  currency: "USD",
  checkedAt,
  availability: "available",
};
test("campaign prices use integer cents without changing the listed currency", () => {
  assert.equal(campaignPrice(offer, now), "$555");
  assert.equal(campaignPrice({ ...offer, priceMinor: 6698 }, now), "$66.98");
  assert.equal(
    campaignPrice({ ...offer, currency: "EUR" as "USD" }, now),
    null,
  );
});
test("a dated listing never keeps showing its old price after seven days", () => {
  assert.equal(campaignPrice(offer, now + 7 * 86400000 - 1), "$555");
  assert.equal(campaignPrice(offer, now + 7 * 86400000), null);
});
test("unavailable, missing, future, and invalid observations cannot become advertised prices", () => {
  for (const patch of [
    { availability: "unknown" as const },
    { availability: "unavailable" as const },
    { priceMinor: undefined },
    { priceMinor: -1 },
    { priceMinor: 5.5 },
    { priceMinor: NaN },
    { checkedAt: "invalid" },
    { checkedAt: "2027-01-01T00:00:00.000Z" },
  ])
    assert.equal(campaignPrice({ ...offer, ...patch }, now), null);
});
test("a visual candidate stays a similar match rather than claiming an exact model", () => {
  assert.equal(campaignMatchLabel("similar"), "Similar match");
  assert.equal(campaignMatchLabel("model"), "Model match");
});
