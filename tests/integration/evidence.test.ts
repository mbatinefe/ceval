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
