import { test } from "node:test";
import assert from "node:assert/strict";
import { citedOffers } from "../../src/server/providers/citations.ts";
import type { Product } from "../../src/shared/scan.ts";

const product: Product = {
  id: "p",
  brand: "Sony",
  model: "WH-1000XM5",
  variant: "Black",
  label: "Headphones",
  confidence: 0.95,
  box: { x: 0, y: 0, width: 1, height: 1 },
  shelfPriceMinor: null,
  shelfCurrency: null,
};
const url = "https://shop.example.com/headphones";
const source = { url, title: "Sony WH-1000XM5 Black headphones", snippet: "" };
const offer = {
  url,
  priceMinor: 24999,
  currency: "USD",
  kind: "retail",
  supportingText: "Sony WH-1000XM5 Black headphones cost USD $249.99.",
};
function block(row = offer, prefix = "") {
  const line = JSON.stringify(row);
  return {
    text: prefix + line,
    annotations: [
      {
        type: "url_citation",
        url: row.url,
        title: source.title,
        start_index: Array.from(prefix).length,
        end_index: Array.from(prefix + line).length,
      },
    ],
  };
}
test("a natively cited price is labelled a cited summary, never raw retailer evidence", () => {
  const found = citedOffers([block()], [source], product, "US", "buy");
  assert.equal(found.length, 1);
  assert.equal(found[0].priceMinor, 24999);
  assert.equal(found[0].url, url);
  assert.equal(found[0].evidenceType, "cited_summary");
  assert.equal(found[0].condition, "unknown");
  assert.equal(found[0].match, "exact");
});
for (const [name, change] of [
  ["missing citation", { annotations: [] }],
  [
    "different citation URL",
    {
      annotations: [
        {
          ...block().annotations[0],
          url: "https://elsewhere.example.com/item",
        },
      ],
    },
  ],
  [
    "negative span",
    { annotations: [{ ...block().annotations[0], start_index: -1 }] },
  ],
  [
    "out of bounds span",
    { annotations: [{ ...block().annotations[0], end_index: 99999 }] },
  ],
  [
    "partial price citation",
    { annotations: [{ ...block().annotations[0], end_index: 40 }] },
  ],
] as const) {
  test(`rejects ${name}`, () =>
    assert.deepEqual(
      citedOffers([{ ...block(), ...change }], [source], product, "US", "buy"),
      [],
    ));
}
test("a citation alone cannot invent a source absent from completed search results", () => {
  assert.deepEqual(citedOffers([block()], [], product, "US", "buy"), []);
});
test("a generated price must match the cited statement's amount", () => {
  assert.deepEqual(
    citedOffers(
      [block({ ...offer, priceMinor: 19999 })],
      [source],
      product,
      "US",
      "buy",
    ),
    [],
  );
});
test("the actual search title must identify the model and cannot describe an accessory", () => {
  for (const title of [
    "Sony WH-1000XM4 Black",
    "Sony WH-1000XM5 Black replacement ear pads",
    "Headphones sale",
  ]) {
    assert.deepEqual(
      citedOffers([block()], [{ ...source, title }], product, "US", "buy"),
      [],
    );
  }
});
test("generated variant and condition claims cannot upgrade the source's evidence", () => {
  const found = citedOffers(
    [
      block({
        ...offer,
        supportingText: "Sony WH-1000XM5 Black brand new USD $249.99.",
      }),
    ],
    [{ ...source, title: "Sony WH-1000XM5 headphones" }],
    product,
    "US",
    "buy",
  );
  assert.equal(found[0].match, "possible");
  assert.equal(found[0].condition, "unknown");
});
test("a model's sold claim is kept as an asking price without source text confirming a sale", () => {
  const found = citedOffers(
    [
      block({
        ...offer,
        kind: "sold",
        supportingText: "Sony WH-1000XM5 Black used sold for USD $249.99.",
      }),
    ],
    [source],
    product,
    "US",
    "resale",
  );
  assert.equal(found[0].kind, "asking");
});
test("conditional payments are rejected even when cited", () => {
  assert.deepEqual(
    citedOffers(
      [
        block({
          ...offer,
          supportingText:
            "Sony WH-1000XM5 Black USD $249.99 per month financing.",
        }),
      ],
      [source],
      product,
      "US",
      "buy",
    ),
    [],
  );
});
test("Unicode before a cited record does not move its citation to a different claim", () => {
  assert.equal(
    citedOffers(
      [block(offer, "🔎 Results\n")],
      [source],
      product,
      "US",
      "buy",
    )[0].priceMinor,
    24999,
  );
});
test("a cited marketplace price retains its asking kind and source condition", () => {
  const [found] = citedOffers(
    [block({ ...offer, kind: "asking" })],
    [{ ...source, title: "Sony WH-1000XM5 Black used headphones" }],
    product,
    "US",
    "buy",
  );
  assert.equal(found?.priceMinor, 24999);
  assert.equal(found?.kind, "asking");
  assert.equal(found?.condition, "used");
  assert.equal(found?.evidenceType, "cited_summary");
});
test("a native citation cannot turn a SOLD source listing into a buy offer", () => {
  assert.deepEqual(
    citedOffers(
      [block({ ...offer, kind: "asking" })],
      [{ ...source, title: "SOLD Sony WH-1000XM5 Black headphones" }],
      product,
      "US",
      "buy",
    ),
    [],
  );
});
test("a cited selected model can use reordered qualifiers but cannot omit them", () => {
  const selected: Product = {
    ...product,
    brand: "Apple",
    model: "MacBook Pro 16-inch (M1 Pro, 2021)",
    variant: "Silver",
    identification: "user_selected",
    confidence: 0.45,
  };
  const row = {
    ...offer,
    priceMinor: 89900,
    kind: "asking",
    supportingText:
      'Apple 2021 MacBook Pro 16" M1 Pro Silver used laptop USD $899.00.',
  };
  const title = 'Apple 2021 MacBook Pro 16" M1 Pro Silver used laptop';
  const [found] = citedOffers(
    [block(row)],
    [{ ...source, title }],
    selected,
    "US",
    "buy",
  );
  assert.equal(found?.priceMinor, 89900);
  assert.equal(found?.match, "possible");
  assert.deepEqual(
    citedOffers(
      [block(row)],
      [{ ...source, title: 'Apple MacBook Pro 16" Silver' }],
      selected,
      "US",
      "buy",
    ),
    [],
  );
});
