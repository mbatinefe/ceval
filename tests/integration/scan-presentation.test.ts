import { test } from "node:test";
import assert from "node:assert/strict";
import { offerSummary } from "../../src/client/scanner/presentation.ts";
import type { Comparison, Offer } from "../../src/shared/scan.ts";

const retail: Offer = {
  title: "Headphones",
  url: "https://shop.example/item",
  priceMinor: 19900,
  currency: "USD",
  condition: "new",
  kind: "retail",
  match: "exact",
  evidence: "Headphones listed at USD 199",
};
function comparison(
  offers: Offer[],
  mode: "buy" | "resale" = "buy",
): Comparison {
  return {
    id: "comparison",
    mode,
    market: "US",
    offers,
    status: "found",
    checkedAt: Date.now(),
    expiresAt: Date.now() + 60000,
    product: {
      id: "item",
      brand: "Sony",
      model: "WH-1000XM5",
      variant: "Black",
      label: "Headphones",
      confidence: 0.95,
      box: { x: 0, y: 0, width: 1, height: 1 },
      shelfPriceMinor: 29900,
      shelfCurrency: "USD",
    },
  };
}
test("buy summary selects comparable exact retail offers, without mixing currencies or asking prices", () => {
  const input = comparison([
    { ...retail, priceMinor: 1000, kind: "asking" },
    { ...retail, priceMinor: 900, currency: "GBP" },
    { ...retail, priceMinor: 800, match: "possible" },
    retail,
  ]);
  const summary = offerSummary(input)!;
  assert.equal(summary.offer, retail);
  assert.equal(summary.label, "Online price");
  assert.equal(summary.savingsMinor, 10000);
  assert.equal(input.offers[0].kind, "asking");
});
test("search summaries and possible matches never claim verified savings", () => {
  const cited = offerSummary(
    comparison([{ ...retail, evidenceType: "cited_summary" }]),
  )!;
  assert.equal(cited.label, "Search-reported price");
  assert.equal(cited.savingsMinor, null);
  assert.equal(
    offerSummary(comparison([{ ...retail, match: "possible" }]))!.savingsMinor,
    null,
  );
  assert.equal(
    offerSummary(comparison([{ ...retail, condition: "used" }]))!.savingsMinor,
    null,
  );
});
test("resale distinguishes completed sales from asking prices and retail offers", () => {
  const asking = {
    ...retail,
    priceMinor: 15000,
    kind: "asking" as const,
    condition: "used" as const,
  };
  const sold = { ...asking, priceMinor: 18000, kind: "sold" as const };
  assert.equal(
    offerSummary(comparison([retail, asking], "resale"))!.label,
    "Asking price",
  );
  const result = offerSummary(comparison([retail, asking, sold], "resale"))!;
  assert.equal(result.offer, sold);
  assert.equal(result.label, "Reported sale");
  assert.equal(result.savingsMinor, null);
});
test("empty, stale or incompatible results cannot supply a floating price", () => {
  assert.equal(offerSummary(undefined), null);
  assert.equal(offerSummary(comparison([])), null);
  assert.equal(offerSummary({ ...comparison([retail]), expiresAt: 0 }), null);
  assert.equal(
    offerSummary(comparison([{ ...retail, currency: "EUR" }])),
    null,
  );
});
test("history can display an explicitly expired price without making live overlays current", () => {
  const saved = { ...comparison([retail]), expiresAt: 0 };
  assert.equal(offerSummary(saved), null);
  const historical = offerSummary(saved, { includeExpired: true });
  assert.equal(historical?.offer.priceMinor, 19900);
  assert.equal(historical?.offer.kind, "retail");
  assert.equal(saved.expiresAt, 0);
});
test("compact prices retain possible-match and condition qualifications", () => {
  const result = offerSummary(
    comparison([{ ...retail, match: "possible", condition: "used" }]),
  )!;
  assert.equal(result.qualification, "Possible match · Used");
  assert.equal(
    offerSummary(comparison([{ ...retail, condition: "unknown" }]))!
      .qualification,
    "Check condition",
  );
});
test("buy falls back to public asking prices without presenting resale proceeds or savings", () => {
  const asking = {
    ...retail,
    kind: "asking" as const,
    condition: "used" as const,
  };
  const result = offerSummary(comparison([asking]))!;
  assert.equal(result.offer, asking);
  assert.equal(result.label, "Asking price");
  assert.equal(result.savingsMinor, null);
  assert.equal(offerSummary(comparison([{ ...asking, kind: "sold" }])), null);
});

test("the headline prefers a verified exact new price over used offers and search snippets", () => {
  const verified = {
    ...retail,
    priceMinor: 22000,
    evidenceType: "product_page" as const,
  };
  const lowerVerified = { ...verified, priceMinor: 21000 };
  const summary = offerSummary(
    comparison([
      { ...retail, priceMinor: 10000, condition: "used" },
      { ...retail, priceMinor: 15000, evidenceType: "cited_summary" },
      { ...verified, priceMinor: 9000, match: "possible" },
      verified,
      lowerVerified,
    ]),
  )!;
  assert.equal(summary.offer, lowerVerified);
  assert.equal(summary.label, "Lowest new price found");
  assert.equal(summary.savingsMinor, 8900);
});

test("an exact used listing outranks a different model's retail price", () => {
  const exact = {
    ...retail,
    priceMinor: 9000,
    condition: "used" as const,
    kind: "asking" as const,
  };
  const summary = offerSummary(
    comparison([{ ...retail, priceMinor: 1000, match: "possible" }, exact]),
  )!;
  assert.equal(summary.offer, exact);
  assert.equal(summary.label, "Asking price");
});
