import { test } from "node:test";
import assert from "node:assert/strict";
import * as prices from "../../src/server/providers/visual-prices.ts";
import { candidateFromPage } from "../../src/server/providers/product-media.ts";
import type { VisualCandidate } from "../../src/shared/visual-search.ts";
const candidate: VisualCandidate = {
  id: "chair",
  title: "White square side table",
  url: "https://www.target.com/p/white-table/-/A-12345",
  source: "target.com",
  assessment: "unreviewed",
  reason: "Retrieved listing",
};
const source = { title: candidate.title, url: candidate.url, snippet: "" };
const row = {
  url: candidate.url,
  priceMinor: 1999,
  currency: "USD",
  kind: "retail",
  supportingText: "White square side table. USD 19.99. In stock.",
};
function block(value = row) {
  const text = JSON.stringify(value);
  return {
    text,
    annotations: [
      {
        type: "url_citation",
        url: value.url,
        title: source.title,
        start_index: 0,
        end_index: Array.from(text).length,
      },
    ],
  };
}
test("a listing-owned native citation can supply a clearly marked search price", () => {
  const [found] = prices.candidatePrices(
    [candidate],
    [block()],
    [source],
    "US",
    "buy",
  );
  assert.equal(found.price?.priceMinor, 1999);
  assert.equal(found.price?.evidenceType, "search_result");
  assert.equal(found.assessment, "unreviewed");
  assert.equal(found.identity, undefined);
  assert.equal(candidate.price, undefined);
});
test("missing citations, unrelated prices, foreign currency and retail-as-resale fail closed", () => {
  for (const b of [
    { ...block(), annotations: [] },
    block({ ...row, supportingText: "Different round table USD 19.99" }),
    block({ ...row, currency: "GBP" }),
  ])
    assert.equal(
      prices.candidatePrices([candidate], [b], [source], "US", "buy")[0].price,
      undefined,
    );
  assert.equal(
    prices.candidatePrices([candidate], [block()], [source], "US", "resale")[0]
      .price,
    undefined,
  );
});
test("an accessible page without Product pricing preserves a cited price; contradictory structured stock removes it", () => {
  const [priced] = prices.candidatePrices(
    [candidate],
    [block()],
    [source],
    "US",
    "buy",
  );
  const og =
    '<meta property="og:type" content="product"><meta property="og:title" content="White square side table">';
  assert.equal(
    candidateFromPage(priced, og, candidate.url, "US", "buy").price
      ?.evidenceType,
    "search_result",
  );
  const html =
    og +
    '<script type="application/ld+json">' +
    JSON.stringify({
      "@type": "Product",
      name: candidate.title,
      offers: {
        "@type": "Offer",
        price: "19.99",
        priceCurrency: "USD",
        availability: "https://schema.org/OutOfStock",
      },
    }) +
    "</script>";
  assert.equal(
    candidateFromPage(priced, html, candidate.url, "US", "buy").price,
    undefined,
  );
  assert.equal(
    candidateFromPage(
      priced,
      og,
      "https://www.target.com/p/different-table/-/A-99999",
      "US",
      "buy",
    ).price,
    undefined,
  );
});

test("tracking parameters do not detach a cited price from its canonical listing", () => {
  const tracked = candidate.url + "?utm_source=search";
  const [found] = prices.candidatePrices(
    [candidate],
    [block({ ...row, url: tracked })],
    [{ ...source, url: tracked }],
    "US",
    "buy",
  );
  assert.equal(found.price?.priceMinor, 1999);
});
