import test from "node:test";
import assert from "node:assert/strict";
import { parseProducts } from "../../src/server/scan/validation.ts";

const item = {
  label: "red mug",
  confidence: 0.4,
  box: { x: 0.2, y: 0.2, width: 0.3, height: 0.3 },
};
test("one unusable position cannot discard valid products in a captured view", () => {
  const products = parseProducts(
    {
      products: [
        { ...item, box: { x: 200, y: 30, width: 100, height: 100 } },
        { ...item, previousReferenceIndex: 0 },
        { ...item, box: { x: 0.2, y: 0.2, width: 0, height: 0.3 } },
        null,
        { ...item, previousReferenceIndex: 0 },
      ],
    },
    ["earlier-mug"],
    6,
    true,
  );
  assert.equal(products.length, 2);
  assert.equal(products[0].previousProductId, "earlier-mug");
  assert.equal(products[1].previousProductId, undefined);
});
test("partially visible products are clipped to the source image", () => {
  const [product] = parseProducts(
    {
      products: [
        { ...item, box: { x: 0.8, y: 0.75, width: 0.4, height: 0.5 } },
      ],
    },
    [],
    6,
    true,
  );
  assert.ok(Math.abs(product.box.width - 0.2) < 1e-10);
  assert.equal(product.box.height, 0.25);
  assert.equal(product.box.x + product.box.width, 1);
  assert.equal(product.box.y + product.box.height, 1);
});
test("malformed groups and oversized detections still fail, and legacy parsing stays strict", () => {
  assert.throws(() =>
    parseProducts({ products: Array(7).fill(item) }, [], 6, true),
  );
  assert.throws(() => parseProducts({ products: "invalid" }, [], 6, true));
  assert.throws(() =>
    parseProducts({
      products: [{ ...item, box: { x: 0.8, y: 0.1, width: 0.4, height: 0.5 } }],
    }),
  );
  assert.deepEqual(
    parseProducts(
      {
        products: [{ ...item, box: { x: 1, y: 0.1, width: 0.1, height: 0.1 } }],
      },
      [],
      6,
      true,
    ),
    [],
  );
});
