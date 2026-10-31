import { test } from "node:test";
import assert from "node:assert/strict";
import {
  visualSearchNeeded,
  visualResultMatches,
} from "../../src/client/scanner/visual-search.ts";
import { interruptFinds } from "../../src/client/scanner/state.ts";
import type { FoundProduct } from "../../src/client/scanner/continuity.ts";
import type { VisualSearch } from "../../src/shared/visual-search.ts";
const row: FoundProduct = {
  product: {
    id: "unknown",
    brand: "AZOPA",
    model: "",
    variant: "",
    label: "Portable monitor",
    confidence: 0.35,
    box: { x: 0, y: 0, width: 1, height: 1 },
    shelfPriceMinor: null,
    shelfCurrency: null,
  },
  thumbnail: "data:image/jpeg;base64,test",
  time: 0,
};
const result: VisualSearch = {
  productId: "unknown",
  market: "US",
  candidates: [],
  checkedAt: Date.now(),
  expiresAt: Date.now() + 100000,
  ranking: "no_matches",
};
test("ambiguous finds search once without a selected model", () => {
  assert.equal(visualSearchNeeded(row, "US", true), true);
  for (const altered of [
    { visualSearching: true },
    { visualError: "Unavailable" },
    { visualSearch: result },
    { thumbnail: undefined },
  ])
    assert.equal(visualSearchNeeded({ ...row, ...altered }, "US", true), false);
  assert.equal(visualSearchNeeded(row, "US", false), false);
  assert.equal(
    visualSearchNeeded(
      {
        ...row,
        product: {
          ...row.product,
          model: "A1S",
          identification: "user_selected",
        },
      },
      "US",
      true,
    ),
    false,
  );
});
test("image matches cannot move to a different product or market", () => {
  assert.equal(visualResultMatches(row, result, "US"), true);
  assert.equal(
    visualResultMatches(
      { ...row, product: { ...row.product, id: "replacement" } },
      result,
      "US",
    ),
    false,
  );
  assert.equal(visualResultMatches(row, result, "GB"), false);
});
test("pausing clears visual busy state and leaves a retryable explanation", () => {
  const [paused] = interruptFinds([{ ...row, visualSearching: true }]);
  assert.equal(paused.visualSearching, false);
  assert.match(paused.visualError || "", /paused/i);
});

test("repeated ambiguous sightings retain the original visual search snapshot", async () => {
  const { reconcileSightings } =
    await import("../../src/client/scanner/continuity.ts");
  const frame = {
    width: 48,
    height: 48,
    pixels: Uint8Array.from(
      { length: 48 * 48 },
      (_, i) =>
        ((i % 48) % 8 < 4 ? 50 : 180) + (Math.floor(i / 48) % 8 < 4 ? 20 : 0),
    ),
  };
  const context = {
    time: 1,
    now: 1000,
    frame,
    mode: "buy" as const,
    market: "US" as const,
    cache: new Map(),
    photos: new Map([[row.product.id, row.thumbnail!]]),
  };
  const initial = reconcileSightings([], [row.product], context).rows;
  const pending = { ...initial[0], visualSearching: true };
  const next = reconcileSightings(
    [pending],
    [{ ...row.product, id: "next-frame" }],
    { ...context, time: 7, now: 7000 },
  ).rows[0];
  assert.equal(next.product.id, row.product.id);
  assert.equal(next.visualSearching, true);
  assert.equal(visualSearchNeeded(next, "US", true), false);
  const completed = reconcileSightings(
    [{ ...next, visualSearching: false, visualSearch: result }],
    [{ ...row.product, id: "third-frame" }],
    { ...context, time: 13, now: 13000 },
  ).rows[0];
  assert.equal(completed.product.id, row.product.id);
  assert.equal(completed.visualSearch?.productId, row.product.id);
  const clearer = reconcileSightings(
    [completed],
    [
      {
        ...row.product,
        id: "readable-label",
        brand: "ARZOPA",
        model: "A1S",
        confidence: 0.96,
      },
    ],
    { ...context, time: 19, now: 19000 },
  );
  assert.ok(clearer.rows.some((r) => r.product.id === "readable-label"));
});

test("saved image matches from another market cannot be reused", async () => {
  const { visualSearchForMarket } =
    await import("../../src/shared/visual-search.ts");
  assert.equal(visualSearchForMarket(result, "US"), result);
  assert.equal(visualSearchForMarket(result, "GB"), undefined);
});
