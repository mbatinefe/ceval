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
