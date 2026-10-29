import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cachedComparison,
  comparisonKey,
  playCurrent,
} from "../../src/client/scanner/state.ts";
import type { Comparison, Product } from "../../src/shared/scan.ts";
const product: Product = {
  id: "item",
  brand: "Sony",
  model: "WH-1000XM5",
  variant: "Black",
  label: "Headphones",
  confidence: 0.95,
  box: { x: 0, y: 0, width: 1, height: 1 },
  shelfPriceMinor: 29999,
  shelfCurrency: "USD",
};
test("new shelf prices cannot reuse an obsolete comparison snapshot", () => {
  const comparison: Comparison = {
    id: "comparison",
    product,
    mode: "buy",
    market: "US",
    offers: [],
    status: "no_evidence",
    checkedAt: Date.now(),
    expiresAt: Date.now() + 60000,
  };
  const cache = new Map([[comparisonKey(product, "buy", "US"), comparison]]);
  assert.equal(cachedComparison(cache, product, "buy", "US"), comparison);
  assert.equal(
    cachedComparison(
      cache,
      { ...product, shelfPriceMinor: 19999 },
      "buy",
      "US",
    ),
    undefined,
  );
  assert.equal(
    cachedComparison(cache, { ...product, shelfCurrency: "GBP" }, "buy", "US"),
    undefined,
  );
});
test("rejected playback from a replaced source does not fail the new source", async () => {
  let reject: (e: Error) => void = () => {},
    current = true;
  const play = new Promise<void>((_, r) => {
    reject = r;
  });
  const operation = playCurrent(
    () => play,
    () => current,
  );
  current = false;
  reject(new Error("source replaced"));
  assert.equal(await operation, false);
});
test("resolved playback from a replaced source cannot activate scanning", async () => {
  let resolve: () => void = () => {},
    current = true;
  const play = new Promise<void>((r) => {
    resolve = r;
  });
  const operation = playCurrent(
    () => play,
    () => current,
  );
  current = false;
  resolve();
  assert.equal(await operation, false);
});
