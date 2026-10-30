import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProducts } from "../../src/server/scan/validation.ts";
import { marketplaceSearch } from "../../src/shared/marketplace.ts";

const product = {
  brand: "Logitech",
  model: "",
  variant: "Black",
  label: "Wired gaming mouse",
  confidence: 0.5,
  box: { x: 0.1, y: 0.1, width: 0.4, height: 0.4 },
};
const suggestion = {
  brand: "Logitech",
  model: "G502 HERO",
  variant: "Black",
  reason: "Check the thumb rest and side-button layout.",
};
test("Marketplace action opens an encoded product search, not a fabricated listing", () => {
  const query = {
    brand: "Logitech",
    model: "G502 & HERO",
    variant: "Black / White",
  };
  const link = new URL(marketplaceSearch(query));
  assert.equal(link.origin, "https://www.facebook.com");
  assert.equal(link.pathname, "/marketplace/search/");
  assert.equal(
    link.searchParams.get("query"),
    "Logitech G502 & HERO Black / White",
  );
  assert.equal([...link.searchParams].length, 1);
});
test("visual model suggestions remain uncertain and cannot assert user selection", () => {
  const [found] = parseProducts({
    products: [
      {
        ...product,
        confidence: 0.99,
        candidates: [suggestion],
        identification: "user_selected",
      },
    ],
  });
  assert.deepEqual(found.candidates, [suggestion]);
  assert.ok(found.confidence < 0.85);
  assert.equal(found.identification, undefined);
});
test("candidate parsing excludes invalid duplicates and caps the visual shortlist", () => {
  const [found] = parseProducts({
    products: [
      {
        ...product,
        candidates: [
          null,
          {},
          { ...suggestion, model: "" },
          suggestion,
          { ...suggestion, model: "g502 hero" },
          ...Array.from({ length: 8 }, (_, i) => ({
            ...suggestion,
            model: `G${i}`,
          })),
        ],
      },
    ],
  });
  assert.equal(found.candidates?.length, 5);
  assert.equal(found.candidates?.[0].model, "G502 HERO");
});
