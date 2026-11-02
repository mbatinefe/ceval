import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cachedComparison,
  comparisonKey,
  playCurrent,
  comparisonNeeded,
  interruptFinds,
  completionMessage,
  isAllowanceError,
  recognitionRetryAt,
  findActionRow,
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

test("a delayed comparison cannot be cached against an older shelf label", async () => {
  const { cacheMatchingComparison } =
    await import("../../src/client/scanner/state.ts");
  const comparison: Comparison = {
    id: "late",
    product: { ...product, shelfPriceMinor: 19999 },
    mode: "buy",
    market: "US",
    offers: [],
    status: "no_evidence",
    checkedAt: Date.now(),
    expiresAt: Date.now() + 60000,
  };
  const cache = new Map<string, Comparison>();
  assert.equal(
    cacheMatchingComparison(cache, product, "buy", "US", comparison),
    false,
  );
  assert.equal(cachedComparison(cache, product, "buy", "US"), undefined);
  assert.equal(
    cacheMatchingComparison(cache, comparison.product, "buy", "US", comparison),
    true,
  );
  assert.equal(
    cachedComparison(cache, comparison.product, "buy", "US"),
    comparison,
  );
});

test("automatic comparison waits for explicit retry after failure and does not duplicate pending work", () => {
  const row = { product, time: 0 };
  assert.equal(comparisonNeeded(row), true);
  assert.equal(comparisonNeeded({ ...row, searching: true }), false);
  assert.equal(comparisonNeeded({ ...row, selecting: true }), false);
  assert.equal(
    comparisonNeeded({
      ...row,
      error: "Provider unavailable",
      retryable: true,
    }),
    false,
  );
  assert.equal(
    comparisonNeeded({ ...row, product: { ...product, confidence: 0.5 } }),
    false,
  );
});

test("interrupted searches remain actionable instead of waiting forever", () => {
  const rows = interruptFinds([{ product, time: 0, searching: true }]);
  assert.equal(rows[0].searching, false);
  assert.equal(rows[0].retryable, true);
  assert.ok(rows[0].error);
  assert.equal(comparisonNeeded(rows[0]), false);
});

test("video completion acknowledges unfinished finds without claiming every result is ready", () => {
  const ready: Comparison = {
    id: "ready",
    product,
    mode: "buy",
    market: "US",
    offers: [
      {
        title: "Headphones",
        url: "https://shop.example/item",
        priceMinor: 19900,
        currency: "USD",
        condition: "new",
        kind: "retail",
        match: "exact",
        evidence: "Listed at USD199",
      },
    ],
    status: "found",
    checkedAt: 0,
    expiresAt: Date.now() + 60000,
  };
  const message = completionMessage(
    [
      { product, time: 0, comparison: ready },
      {
        product: { ...product, id: "failed" },
        time: 0,
        error: "Search failed",
        retryable: true,
      },
    ],
    "video",
    false,
  );
  assert.match(message, /1 find with prices/);
  assert.match(message, /1 find.*attention/);
  assert.match(completionMessage([], "video", false), /No products/);
  assert.match(completionMessage([], "video", true), /Finishing/);
});

test("budget exhaustion codes block further automatic paid requests but provider errors remain recoverable", () => {
  for (const code of [
    "allowance_exhausted",
    "daily_budget_exhausted",
    "total_budget_exhausted",
    "account_allowance_exhausted",
  ])
    assert.equal(isAllowanceError(code), true);
  assert.equal(isAllowanceError("provider_rate_limited"), false);
  assert.equal(isAllowanceError("analysis_incomplete"), false);
});

test("recognition gets one delayed retry for transient failures, never a loop or budget retry", () => {
  assert.equal(
    recognitionRetryAt({ code: "provider_rate_limited", status: 503 }, 0, 1000),
    13000,
  );
  assert.equal(
    recognitionRetryAt(new TypeError("Network failed"), 0, 1000),
    13000,
  );
  assert.equal(
    recognitionRetryAt({ code: "provider_rate_limited", status: 503 }, 1, 1000),
    null,
  );
  assert.equal(
    recognitionRetryAt(
      { code: "daily_budget_exhausted", status: 429 },
      0,
      1000,
    ),
    null,
  );
  assert.equal(
    recognitionRetryAt({ code: "invalid_request", status: 400 }, 0, 1000),
    null,
  );
});

test("historical comparisons with a changed shelf price still need attention at video end", () => {
  const historical: Comparison = {
    id: "historical",
    product,
    mode: "buy",
    market: "US",
    offers: [],
    status: "no_evidence",
    checkedAt: 0,
    expiresAt: Date.now() + 60000,
  };
  const message = completionMessage(
    [
      {
        product,
        time: 0,
        comparison: historical,
        error: "The shelf label changed",
        errorCode: "shelf_changed",
      },
    ],
    "video",
    false,
  );
  assert.match(message, /No prices found yet/);
  assert.match(message, /1 find.*attention/);
});

test("completed empty searches do not count as ready prices", () => {
  const comparison: Comparison = {
    id: "empty",
    product,
    mode: "resale",
    market: "US",
    offers: [],
    status: "no_evidence",
    checkedAt: Date.now(),
    expiresAt: Date.now() + 60000,
  };
  const message = completionMessage(
    [{ product, time: 0, comparison }],
    "video",
    false,
  );
  assert.match(message, /No prices found yet/);
  assert.match(message, /1 find needs attention/);
  assert.doesNotMatch(message, /ready/);
});

test("actions target a local find when uncertain server fingerprints collide", () => {
  const first = { rowId: "first-card", product, time: 1 };
  const second = { rowId: "second-card", product, time: 2 };
  assert.equal(
    findActionRow([first, second], product.id, "second-card"),
    second,
  );
  assert.equal(findActionRow([first, second], product.id), undefined);
  assert.equal(findActionRow([first], product.id), first);
});

test("stopping reports that pending searches will finish and keeps its completed status", () => {
  assert.equal(
    completionMessage([], "stopped", true),
    "Scan stopped. Finishing your searches…",
  );
  assert.equal(
    completionMessage([], "stopped", false),
    "Scan stopped. No products identified yet.",
  );
});
