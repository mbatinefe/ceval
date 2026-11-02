import { test } from "node:test";
import assert from "node:assert/strict";
import { validateOffers } from "../../src/server/scan/validation.ts";
import { variantConflicts } from "../../src/server/providers/product-identity.ts";
import { candidateFromPage } from "../../src/server/providers/product-media.ts";
import { visualResultMatches } from "../../src/client/scanner/visual-search.ts";
import * as presentation from "../../src/client/scanner/presentation.ts";
import type { Product } from "../../src/shared/scan.ts";
import type {
  VisualCandidate,
  VisualSearch,
} from "../../src/shared/visual-search.ts";

const product: Product = {
  id: "p",
  brand: "Twinings",
  model: "English Breakfast",
  variant: "20 tea bags",
  label: "tea box",
  confidence: 0.95,
  box: { x: 0, y: 0, width: 1, height: 1 },
  shelfPriceMinor: 800,
  shelfCurrency: "USD",
};
const url = "https://www.target.com/p/english-breakfast/-/A-12345";
function offers(title: string, observed = product) {
  return validateOffers(
    { offers: [{ url, priceMinor: 499, currency: "USD", kind: "retail" }] },
    [{ url, title, snippet: "USD 4.99. New condition. In stock." }],
    observed,
    "US",
    "buy",
  );
}
test("packaged goods exclude incompatible quantities and confirm the same pack", () => {
  assert.equal(offers("Twinings English Breakfast 80 tea bags").length, 0);
  assert.equal(
    offers("Twinings English Breakfast 20 tea bags")[0]?.match,
    "exact",
  );
  assert.equal(offers("Twinings English Breakfast")[0]?.match, "possible");
  assert.equal(
    offers("Twinings English Breakfast 20 tea bags pack of 6").length,
    0,
  );
  assert.equal(
    offers("Twinings English Breakfast 20 tea bags pack of 6", {
      ...product,
      variant: "20 tea bags pack of 6",
    }).length,
    1,
  );
  assert.equal(
    offers("Twinings English Breakfast 20 tea bags pack of 3", {
      ...product,
      variant: "20 tea bags pack of 6",
    }).length,
    0,
  );
});
test("personal care checks equivalent volumes and explicitly conflicting sizes", () => {
  assert.equal(variantConflicts("body wash 250 ml", "500 ml"), true);
  assert.equal(variantConflicts("body wash 0.5 L", "500 ml"), false);
  assert.equal(variantConflicts("body wash 500 ml", "500 ml"), false);
  assert.equal(variantConflicts("body wash", "500 ml"), false);
});
test("clothes and groceries do not compare incompatible explicit variants", () => {
  for (const [a, b] of [
    ["Size XL", "Size M"],
    ["size 8", "size 10"],
    ["vanilla yogurt", "strawberry"],
    ["decaffeinated tea", "regular caffeinated"],
  ])
    assert.equal(variantConflicts(a, b), true, `${a} vs ${b}`);
  assert.equal(variantConflicts("Size Medium", "size M"), false);
  assert.equal(variantConflicts("cotton shirt", "size M"), false);
});
const candidate: VisualCandidate = {
  id: "c",
  title: "Oak chair",
  url: "https://www.target.com/p/oak-chair/-/A-12345",
  source: "target.com",
  assessment: "similar",
  reason: "Similar shape",
};
const page = (products: unknown) =>
  `<script type="application/ld+json">${JSON.stringify(products)}</script>`;
const chair = {
  "@type": "Product",
  name: "Oak dining chair",
  image: "https://target.scene7.com/chair.jpg",
  offers: {
    "@type": "Offer",
    price: "49.99",
    priceCurrency: "USD",
    availability: "https://schema.org/InStock",
    itemCondition: "https://schema.org/NewCondition",
  },
};
test("a single unbranded listing can supply its own price without identifying the scan", () => {
  const result = candidateFromPage(
    candidate,
    page(chair),
    candidate.url,
    "US",
    "buy",
  );
  assert.equal(result.price?.priceMinor, 4999);
  assert.equal(result.price?.evidenceType, "product_page");
  assert.equal(result.identity, undefined);
  assert.equal(result.assessment, "similar");
});
test("ambiguous, unavailable and wrong-market listing prices remain absent", () => {
  for (const value of [
    [chair, { ...chair, name: "Other chair" }],
    {
      ...chair,
      offers: {
        ...chair.offers,
        availability: "https://schema.org/OutOfStock",
      },
    },
    { ...chair, offers: { ...chair.offers, priceCurrency: "CAD" } },
    { ...chair, "@type": "ProductGroup", hasVariant: [chair] },
  ]) {
    assert.equal(
      candidateFromPage(candidate, page(value), candidate.url, "US", "buy")
        .price,
      undefined,
    );
  }
  assert.equal(
    candidateFromPage(candidate, page(chair), candidate.url, "US", "resale")
      .price,
    undefined,
  );
});
const visual: VisualSearch = {
  provider: "meta",
  version: 2,
  productId: "p",
  market: "US",
  mode: "buy",
  ranking: "meta",
  candidates: [
    {
      ...candidate,
      price: {
        priceMinor: 4999,
        currency: "USD",
        kind: "retail",
        condition: "new",
        evidenceType: "product_page",
      },
    },
  ],
  checkedAt: Date.now(),
  expiresAt: Date.now() + 60000,
};
test("similar-item prices stay qualified and cannot become exact savings or resale values", () => {
  const row = { product, visualSearch: visual, time: 0 };
  const summary = presentation.findSummary(row, "buy", "US");
  assert.equal(summary?.offer.priceMinor, 4999);
  assert.equal(summary?.label, "Similar item price");
  assert.match(summary?.qualification || "", /not confirmed/i);
  assert.equal(summary?.savingsMinor, null);
  assert.equal(presentation.findSummary(row, "resale", "US"), null);
  assert.equal(
    presentation.findSummary(
      { ...row, visualSearch: { ...visual, expiresAt: 0 } },
      "buy",
      "US",
    ),
    null,
  );
  assert.equal(
    presentation.findSummary(
      {
        ...row,
        visualSearch: {
          ...visual,
          candidates: [{ ...visual.candidates[0], assessment: "unreviewed" }],
        },
      },
      "buy",
      "US",
    ),
    null,
  );
  assert.equal(visualResultMatches(row, visual, "US", "resale"), false);
  assert.equal(
    visualResultMatches(row, { ...visual, mode: undefined }, "US", "buy"),
    true,
  );
});

test("bare apparel sizes exclude conflicting offers even without the word size", async () => {
  const { productSources } =
    await import("../../src/server/providers/product-sources.ts");
  const shirt = {
    ...product,
    brand: "Hanes",
    model: "ComfortSoft",
    variant: "blue M",
    label: "T-Shirt",
  };
  for (const title of [
    "Hanes ComfortSoft T-Shirt blue Size XL",
    "Hanes ComfortSoft T-Shirt blue XL",
  ]) {
    assert.equal(productSources([{ title, url }], shirt, "US").length, 0);
  }
  assert.equal(
    variantConflicts("Hanes ComfortSoft blue Medium", "blue M"),
    false,
  );
  assert.equal(variantConflicts("Size 2XL", "XXL"), false);
});
test("expired similar summaries retain their own timestamp and warning metadata", () => {
  const historical = { ...visual, checkedAt: 1000, expiresAt: 2000 };
  const summary = presentation.findSummary(
    { visualSearch: historical },
    "buy",
    "US",
    { includeExpired: true },
  );
  assert.equal(summary?.label, "Similar item price");
  assert.equal(summary?.checkedAt, 1000);
  assert.equal(summary?.expiresAt, 2000);
});

test("real homeware names retain fractional dimensions and apparel apostrophes", () => {
  for (const name of [
    'LACK Side table - white 21 5/8x21 5/8 "',
    "Men's Cotton T-Shirt 4-Pack Black 2XL",
  ]) {
    const result = candidateFromPage(
      candidate,
      page({ ...chair, name }),
      candidate.url,
      "US",
      "buy",
    );
    assert.equal(result.price?.priceMinor, 4999, name);
  }
});
test("official secure product image metadata works when the ordinary image is HTTP", () => {
  const html =
    '<meta property="og:title" content="English Breakfast"><meta property="og:image" content="http://twiningsusa.com/cdn/shop/files/tea.png"><meta property="og:image:secure_url" content="https://twiningsusa.com/cdn/shop/files/tea.png">';
  const result = candidateFromPage(
    candidate,
    html,
    "https://twiningsusa.com/products/english-breakfast",
    "US",
    "buy",
  );
  assert.match(result.thumbnail || "", /^https:\/\/twiningsusa.com\//);
});

test("stopping reports available similar prices without counting another mode", async () => {
  const { completionMessage } =
    await import("../../src/client/scanner/state.ts");
  const row = { product, visualSearch: visual, time: 0 };
  assert.match(
    completionMessage([row], "stopped", false, { mode: "buy", market: "US" }),
    /1 find with prices.*similar/i,
  );
  assert.match(
    completionMessage([row], "stopped", false, {
      mode: "resale",
      market: "US",
    }),
    /No prices found/,
  );
});
