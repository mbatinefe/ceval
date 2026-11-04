import { test } from "node:test";
import assert from "node:assert/strict";
import * as state from "../../src/client/scanner/state.ts";

test("scan totals keep increasing when older rows leave the recent list", () => {
  const count = new state.ScanFindCount();
  const rows = Array.from({ length: 100 }, (_, i) => ({
    historyId: `find-${i}`,
  }));
  assert.equal(count.update(rows), 100);
  assert.equal(
    count.update([{ historyId: "find-100" }, ...rows.slice(0, 99)]),
    101,
  );
  assert.equal(
    count.update([{ historyId: "find-100" }, ...rows.slice(0, 99)]),
    101,
  );
  assert.equal(count.update([]), 0);
  assert.equal(count.update([{ historyId: "find-100" }]), 1);
});

test("revisiting an identified product after eviction does not inflate the scan total", () => {
  const count = new state.ScanFindCount();
  const rows = Array.from({ length: 101 }, (_, i) => ({
    historyId: `find-${i}`,
    product: { id: `product-${i}` },
  }));
  assert.equal(count.update(rows.slice(0, 100)), 100);
  assert.equal(count.update(rows.slice(1)), 101);
  assert.equal(
    count.update([
      { historyId: "new-row", product: { id: "product-0" } },
      ...rows.slice(2),
    ]),
    101,
  );
});

test("a model confirmation adds a product alias without counting the same find again", () => {
  const count = new state.ScanFindCount();
  assert.equal(
    count.update([{ historyId: "find", product: { id: "unknown" } }]),
    1,
  );
  assert.equal(
    count.update([{ historyId: "find", product: { id: "confirmed" } }]),
    1,
  );
  assert.equal(
    count.update([{ historyId: "later-find", product: { id: "confirmed" } }]),
    1,
  );
});
