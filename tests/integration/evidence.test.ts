import { test } from "node:test";
import assert from "node:assert/strict";
import { validateOffers } from "../../src/server/scan/validation.ts";
import type { Product } from "../../src/shared/scan.ts";
const product: Product = {
  id: "product",
  brand: "Sony",
  model: "WH-1000XM5",
  variant: "Black",
  label: "Headphones",
  confidence: 0.95,
  box: { x: 0, y: 0, width: 1, height: 1 },
  shelfPriceMinor: 29999,
  shelfCurrency: "USD",
};
function check(
  title: string,
  snippet: string,
  priceMinor = 19999,
  mode: "buy" | "resale" = "buy",
  kind = "retail",
) {
  const url = "https://shop.example.com/item";
  return validateOffers(
    { offers: [{ url, priceMinor, currency: "USD", kind }] },
    [{ url, title, snippet }],
    product,
    "US",
    mode,
  );
}
for (const [title, snippet] of [
  ["Sony WH-1000XM5 Black", "Brand new USD $1,199.99"],
  ["Sony WH-1000XM5 Black replacement ear pads", "Brand new USD $199.99"],
  ["Sony WH-1000XM5B Black", "Brand new USD $199.99"],
  ["Sony WH-1000XM5 Black", "Expired deal from 2021: brand new USD $199.99"],
])
  test(`rejects misleading source: ${title} ${snippet}`, () => {
    assert.equal(check(title, snippet).length, 0);
  });
test("negated completion stays an asking price", () => {
  const found = check(
    "Sony WH-1000XM5 Black",
    "Used headphones USD $199.99. Not a completed sale.",
    19999,
    "resale",
    "sold",
  );
  assert.equal(found[0]?.kind, "asking");
});
test("currency amount parsing accepts a complete integer price", () => {
  assert.equal(
    check("Sony WH-1000XM5 Black", "Brand new USD $199", 19900)[0]?.priceMinor,
    19900,
  );
});
test("complete source evidence remains available to inspect", () => {
  const snippet =
    "Product information. ".repeat(65) +
    "Sony WH-1000XM5 Black brand new USD $199.99";
  assert.ok(
    check("Sony WH-1000XM5 Black", snippet)[0]?.evidence.includes("$199.99"),
  );
});
test("buy comparisons retain public used asking prices", () => {
  const [found] = check(
    "Sony WH-1000XM5 Black",
    "Used headphones listed for USD $199.99.",
    19999,
    "buy",
    "asking",
  );
  assert.equal(found?.kind, "asking");
  assert.equal(found?.condition, "used");
});
test("a marketplace listing never becomes a retail offer", () => {
  const url = "https://www.ebay.com/itm/1234567890";
  const [found] = validateOffers(
    { offers: [{ url, priceMinor: 19999, currency: "USD", kind: "retail" }] },
    [{ url, title: "Sony WH-1000XM5 Black", snippet: "Used USD $199.99" }],
    product,
    "US",
    "buy",
  );
  assert.equal(found?.kind, "asking");
});
test("completed sales are never buyable offers", () => {
  for (const kind of ["asking", "retail", "sold"])
    assert.equal(
      check(
        "Sony WH-1000XM5 Black",
        "Used headphones sold for USD $199.99.",
        19999,
        "buy",
        kind,
      ).length,
      0,
    );
});
test("explicit sold listing labels cannot become buy offers", () => {
  const url = "https://www.ebay.com/itm/1234567890";
  for (const [title, snippet] of [
    ["SOLD Sony WH-1000XM5 Black", "Used headphones USD $199.99"],
    ["Sony WH-1000XM5 Black [SOLD]", "Used headphones USD $199.99"],
    ["Sony WH-1000XM5 Black", "This listing sold. Used headphones USD $199.99"],
    ["Sony WH-1000XM5 Black", "This item sold. Used headphones USD $199.99"],
  ])
    assert.deepEqual(
      validateOffers(
        {
          offers: [{ url, priceMinor: 19999, currency: "USD", kind: "asking" }],
        },
        [{ url, title, snippet }],
        product,
        "US",
        "buy",
      ),
      [],
    );
});
test("seller attribution and live unit sales do not close a buy listing", () => {
  for (const snippet of [
    "Used headphones USD $199.99, sold by Example Seller.",
    "Used headphones USD $199.99, sold and shipped by Example Seller.",
    "Used headphones USD $199.99, 10 sold.",
    "Used headphones USD $199.99, 1,234 units sold on this marketplace.",
    "Used headphones USD $199.99. This item has not sold.",
  ]) {
    const [found] = check(
      "Sony WH-1000XM5 Black",
      snippet,
      19999,
      "buy",
      "asking",
    );
    assert.equal(found?.kind, "asking", snippet);
  }
});
test("a sold status without a transaction price cannot upgrade a resale asking price", () => {
  assert.equal(
    check(
      "SOLD Sony WH-1000XM5 Black",
      "Used headphones USD $199.99",
      19999,
      "resale",
      "sold",
    )[0]?.kind,
    "asking",
  );
});
test("marketplace bids and broken-item prices cannot masquerade as ordinary offers", () => {
  for (const snippet of [
    "Used headphones current bid USD $199.99.",
    "Used headphones USD $199.99, 3 bids.",
    "Headphones for parts, not working USD $199.99.",
  ])
    assert.deepEqual(
      check("Sony WH-1000XM5 Black", snippet, 19999, "buy", "asking"),
      [],
    );
});
test("selected model qualifiers can be reordered without losing identity evidence", () => {
  const selected: Product = {
    ...product,
    brand: "Apple",
    model: "MacBook Pro 16-inch (M1 Pro, 2021)",
    variant: "Silver",
    identification: "user_selected",
    confidence: 0.45,
  };
  const url = "https://shop.example.com/laptop";
  const offer = { url, priceMinor: 89900, currency: "USD", kind: "retail" };
  const source = {
    url,
    title: 'Apple 2021 MacBook Pro 16" M1 Pro Silver',
    snippet: "Refurbished laptop USD $899.00",
  };
  const [found] = validateOffers(
    { offers: [offer] },
    [source],
    selected,
    "US",
    "buy",
  );
  assert.equal(found?.priceMinor, 89900);
  assert.equal(found?.condition, "refurbished");
  assert.equal(found?.match, "possible");
  for (const title of [
    'Apple 2021 MacBook Pro 14" M1 Pro Silver',
    'Apple 2021 MacBook Pro 16" M1 Max Silver',
    'Apple 2023 MacBook Pro 16" M1 Pro Silver',
    'Apple MacBook Pro 16" Silver',
  ])
    assert.deepEqual(
      validateOffers(
        { offers: [offer] },
        [{ ...source, title }],
        selected,
        "US",
        "buy",
      ),
      [],
    );
});
