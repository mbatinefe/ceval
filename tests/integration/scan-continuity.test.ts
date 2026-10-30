import { test } from "node:test";
import assert from "node:assert/strict";
import {
  reconcileSightings,
  type FoundProduct,
} from "../../src/client/scanner/continuity.ts";
import type { Product, Comparison } from "../../src/shared/scan.ts";
import type { GrayFrame } from "../../src/client/scanner/tracking.ts";

const frame: GrayFrame = {
  width: 48,
  height: 48,
  pixels: Uint8Array.from(
    { length: 48 * 48 },
    (_, i) =>
      ((i % 48) % 8 < 4 ? 50 : 180) + (Math.floor(i / 48) % 8 < 4 ? 20 : 0),
  ),
};
function product(overrides: Partial<Product> = {}): Product {
  return {
    id: "first",
    brand: "Logitech",
    model: "MX Master 3S",
    variant: "Black",
    label: "Mouse",
    confidence: 0.95,
    box: { x: 0, y: 0, width: 1, height: 1 },
    shelfPriceMinor: 9999,
    shelfCurrency: "USD",
    ...overrides,
  };
}
const candidate = (brand: string, model: string, variant = "Black") => ({
  brand,
  model,
  variant,
  reason: "Check the model label.",
});
function see(
  rows: FoundProduct[],
  products: Product[],
  now = 1000,
  visual = frame,
) {
  return reconcileSightings(rows, products, {
    time: now / 1000,
    now,
    frame: visual,
    mode: "buy",
    market: "US",
    cache: new Map(),
  });
}
function comparison(p: Product): Comparison {
  return {
    id: "comparison",
    product: p,
    mode: "buy",
    market: "US",
    offers: [],
    status: "no_evidence",
    checkedAt: Date.now(),
    expiresAt: Date.now() + 60000,
  };
}

test("changing laptop descriptions and candidate generations retain one visually continuous find", () => {
  const laptop = product({
    model: "",
    brand: "",
    variant: "Silver",
    label: "Silver laptop with notched display",
    candidates: [
      candidate(
        "Apple",
        "MacBook Pro 16-inch (M1 Pro / M1 Max, 2021)",
        "Silver",
      ),
      candidate("Apple", "MacBook Pro 14-inch (M3 / M3 Pro, 2023)", "Silver"),
    ],
  });
  const first = see([], [laptop]);
  const second = see(
    first.rows,
    [
      {
        ...laptop,
        id: "second",
        label: "Silver notebook on table",
        candidates: [
          candidate("Apple", "MacBook Air 15-inch M2 (2022)", "Silver"),
          candidate("Apple", "MacBook Pro 14-inch (M3, 2023)", "Silver"),
        ],
      },
    ],
    10000,
  );
  const third = see(
    second.rows,
    [
      {
        ...laptop,
        id: "third",
        label: "Silver laptop computer on store display table",
        candidates: [candidate("Apple", "MacBook Pro 16-inch A2485", "Silver")],
      },
    ],
    18000,
  );
  assert.equal(third.rows.length, 1);
  assert.equal(third.rows[0].rowId, first.rows[0].rowId);
  assert.equal(third.rows[0].product.id, "third");
});

test("a missing color followed by the same mouse with a color enriches one find using its real server ID", () => {
  const first = see([], [product({ variant: "" })]);
  const next = see(first.rows, [product({ id: "black" })], 9000);
  assert.equal(next.rows.length, 1);
  assert.equal(next.rows[0].product.id, "black");
  assert.equal(next.rows[0].product.variant, "Black");
});

test("a visually continuous unlabelled G mouse becomes the exact packaged model", () => {
  const first = see(
    [],
    [
      product({
        brand: "Logitech G",
        model: "",
        label: "Wired black gaming mouse",
        variant: "Black, wired",
        candidates: [
          candidate("Logitech G", "G502 HERO", "Black, wired"),
          candidate("Logitech G", "G502 X", "Black, wired"),
        ],
      }),
    ],
  );
  const next = see(
    first.rows,
    [product({ id: "labelled", model: "G502 HERO" })],
    16000,
  );
  assert.equal(next.rows.length, 1);
  assert.equal(next.rows[0].product.id, "labelled");
});

test("distinct exact models and explicit colors stay separate even when their appearance matches", () => {
  const first = see([], [product()]);
  const next = see(
    first.rows,
    [
      product(),
      product({ id: "other-model", model: "MX Master 3" }),
      product({ id: "other-color", variant: "White" }),
    ],
    9000,
  );
  assert.equal(next.rows.length, 3);
});

test("two ambiguous lookalikes in a frame cannot claim one historical find", () => {
  const unknown = product({
    model: "",
    candidates: [
      candidate("Logitech", "MX Master 3S"),
      candidate("Logitech", "MX Master 3"),
    ],
  });
  const first = see([], [unknown]);
  const next = see(
    first.rows,
    [
      { ...unknown, id: "left" },
      { ...unknown, id: "right" },
    ],
    9000,
  );
  assert.equal(next.rows.length, 2);
  assert.equal(new Set(next.sightings.map((row) => row.rowId)).size, 2);
});

test("a generic description and position alone never merge products", () => {
  const generic = product({
    brand: "",
    model: "",
    candidates: [],
    label: "Black electronic device",
  });
  const textureless = {
    ...frame,
    pixels: new Uint8Array(frame.pixels.length).fill(100),
  };
  const first = see([], [generic], 1000, textureless);
  assert.equal(
    see(first.rows, [{ ...generic, id: "unrelated" }], 9000, textureless).rows
      .length,
    2,
  );
});

test("candidate overlap alone cannot merge visibly different objects", () => {
  const unknown = product({
    model: "",
    candidates: [candidate("Logitech", "MX Master 3S")],
  });
  const first = see([], [unknown]);
  const other = {
    ...frame,
    pixels: Uint8Array.from(frame.pixels, (v) => 255 - v),
  };
  assert.equal(
    see(first.rows, [{ ...unknown, id: "unrelated" }], 9000, other).rows.length,
    2,
  );
});

test("in-flight comparison and failed state survive repeated recognition", () => {
  const first = see([], [product()]);
  const pending = see(
    first.rows.map((row) => ({ ...row, searching: true })),
    [product()],
    9000,
  );
  assert.equal(pending.rows[0].searching, true);
  const failed = see(
    pending.rows.map((row) => ({
      ...row,
      searching: false,
      error: "Allowance used",
      errorCode: "allowance_exhausted",
      retryable: true,
    })),
    [product()],
    18000,
  );
  assert.equal(failed.rows[0].errorCode, "allowance_exhausted");
  assert.equal(failed.rows[0].retryable, true);
});

test("a return pass retains an exact comparison and its authoritative product snapshot", () => {
  const original = product();
  const first = see([], [original]);
  const saved = comparison(original);
  const next = see(
    first.rows.map((row) => ({ ...row, comparison: saved })),
    [product({ id: "new-server-id", label: "Another description" })],
    140000,
  );
  assert.equal(next.rows.length, 1);
  assert.equal(next.rows[0].comparison, saved);
  assert.equal(next.rows[0].product.id, "first");
});

test("a changed shelf price keeps a local find but cannot retain an old comparison or pending search", () => {
  const original = product();
  const first = see([], [original]);
  const next = see(
    first.rows.map((row) => ({
      ...row,
      comparison: comparison(original),
      searching: true,
    })),
    [product({ shelfPriceMinor: 7999 })],
    9000,
  );
  assert.equal(next.rows.length, 1);
  assert.equal(next.rows[0].product.shelfPriceMinor, 7999);
  assert.equal(next.rows[0].comparison, undefined);
  assert.equal(next.rows[0].searching, false);
});

test("recognition cannot replace a selected model or its comparison with unresolved candidates", () => {
  const unknown = product({
    model: "",
    candidates: [
      candidate("Logitech", "MX Master 3S"),
      candidate("Logitech", "MX Master 3"),
    ],
  });
  const first = see([], [unknown]);
  const selected = product({ id: "selected", identification: "user_selected" });
  const saved = comparison(selected);
  const next = see(
    first.rows.map((row) => ({ ...row, product: selected, comparison: saved })),
    [unknown],
    10000,
  );
  assert.equal(next.rows.length, 1);
  assert.equal(next.rows[0].product.id, "selected");
  assert.equal(next.rows[0].comparison, saved);
});

test("recognition keeps the selectable server snapshot while the user choice is pending", () => {
  const unknown = product({
    model: "",
    candidates: [candidate("Logitech", "MX Master 3S")],
  });
  const first = see([], [unknown]);
  const next = see(
    first.rows.map((row) => ({ ...row, selecting: true })),
    [{ ...unknown, id: "new-sighting" }],
    9000,
  );
  assert.equal(next.rows.length, 1);
  assert.equal(next.rows[0].selecting, true);
  assert.equal(next.rows[0].product.id, "first");
});

test("an ambiguous laptop return pass uses strong appearance and a specific model family", () => {
  const laptop = product({
    model: "",
    brand: "",
    variant: "Silver",
    candidates: [candidate("Apple", "MacBook Pro 14-inch M3", "Silver")],
  });
  const first = see([], [laptop]);
  const returned = see(
    first.rows,
    [
      {
        ...laptop,
        id: "returned",
        label: "Silver notebook on table",
        candidates: [candidate("Apple", "MacBook Pro 16-inch A2485", "Silver")],
      },
    ],
    140000,
  );
  assert.equal(returned.rows.length, 1);
  assert.equal(returned.rows[0].rowId, first.rows[0].rowId);
});

test("selected models retain historical comparison provenance when a later shelf price changes", () => {
  const original = product({ identification: "user_selected" });
  const first = see([], [original]);
  const saved = comparison(original);
  const next = see(
    first.rows.map((row) => ({ ...row, comparison: saved, searching: true })),
    [product({ id: "latest-shelf", shelfPriceMinor: 7999 })],
    9000,
  );
  assert.equal(next.rows.length, 1);
  assert.equal(next.rows[0].product.id, "first");
  assert.equal(next.rows[0].product.shelfPriceMinor, 9999);
  assert.equal(next.rows[0].comparison, saved);
  assert.equal(next.rows[0].errorCode, "shelf_changed");
  assert.equal(next.rows[0].searching, false);
  assert.equal(next.rows[0].retryable, false);
});

test("retained comparison snapshots cannot cross market or shopping mode", () => {
  const original = product();
  const first = see([], [original]);
  const saved = comparison(original);
  for (const context of [
    { market: "GB" as const, mode: "buy" as const },
    { market: "US" as const, mode: "resale" as const },
  ]) {
    const next = reconcileSightings(
      first.rows.map((row) => ({ ...row, comparison: saved })),
      [original],
      { ...context, time: 9, now: 9000, frame, cache: new Map() },
    );
    assert.equal(next.rows[0].comparison, undefined);
  }
});

test("model-code punctuation changes retain identity without merging another generation", () => {
  const first = see([], [product({ brand: "Sony", model: "WH-1000XM5" })]);
  const next = see(
    first.rows,
    [
      product({ id: "punctuation", brand: "Sony", model: "WH1000XM5" }),
      product({
        id: "previous-generation",
        brand: "Sony",
        model: "WH-1000XM4",
      }),
    ],
    9000,
  );
  assert.equal(next.rows.length, 2);
  assert.equal(next.sightings[0].rowId, first.rows[0].rowId);
  assert.notEqual(next.sightings[1].rowId, first.rows[0].rowId);
});

test("a black colorway cannot merge with a black and white colorway", () => {
  const first = see([], [product({ variant: "Black" })]);
  const next = see(
    first.rows,
    [product({ id: "two-tone", variant: "Black / White" })],
    9000,
  );
  assert.equal(next.rows.length, 2);
});

test("generic server fingerprints cannot merge visually different uncertain objects", () => {
  const uncertain = product({
    model: "",
    label: "Black wireless mouse",
    candidates: [
      candidate("Logitech", "MX Master 3S"),
      candidate("Logitech", "MX Master 3"),
    ],
  });
  const first = see([], [uncertain]);
  const other = {
    ...frame,
    pixels: Uint8Array.from(frame.pixels, (value) => 255 - value),
  };
  const next = see(first.rows, [uncertain], 9000, other);
  assert.equal(next.rows.length, 2);
});

test("repeated unresolved products without candidates retain one find with strong crop and label evidence", () => {
  const unknown = product({
    brand: "",
    model: "",
    confidence: 0.3,
    candidates: [],
    label: "Black wireless mouse",
  });
  for (const [id, now] of [
    ["first", 9000],
    ["another-frame", 9000],
    ["returned-frame", 140000],
  ] as const) {
    const first = see([], [unknown]);
    const next = see(
      first.rows,
      [{ ...unknown, id, label: "black wireless mouse!" }],
      now,
    );
    assert.equal(next.rows.length, 1);
    assert.equal(next.rows[0].rowId, first.rows[0].rowId);
    assert.equal(next.rows[0].product.id, id);
    assert.equal(next.rows[0].product.model, "");
    assert.equal(next.rows[0].product.confidence, 0.3);
    assert.equal(next.rows[0].comparison, undefined);
  }
});

test("unresolved label equality cannot merge different crop appearance, brand, or proportions", () => {
  const unknown = product({
    brand: "",
    model: "",
    confidence: 0.3,
    candidates: [],
    label: "Black wireless mouse",
  });
  const first = see([], [unknown]);
  const different = {
    ...frame,
    pixels: Uint8Array.from(frame.pixels, (value) => 255 - value),
  };
  assert.equal(
    see(first.rows, [{ ...unknown, id: "different-crop" }], 9000, different)
      .rows.length,
    2,
  );
  assert.equal(
    see(
      first.rows,
      [{ ...unknown, id: "different-brand", brand: "Acme" }],
      9000,
    ).rows.length,
    2,
  );
  const horizontalTexture = {
    ...frame,
    pixels: Uint8Array.from(frame.pixels, (_, index) =>
      Math.floor(index / frame.width) % 8 < 4 ? 50 : 180,
    ),
  };
  const sameTexture = see([], [unknown], 1000, horizontalTexture);
  assert.equal(
    see(
      sameTexture.rows,
      [
        {
          ...unknown,
          id: "different-shape",
          box: { ...unknown.box, width: 0.5 },
        },
      ],
      9000,
      horizontalTexture,
    ).rows.length,
    2,
  );
});

test("two unresolved no-candidate objects in one frame cannot claim one earlier find", () => {
  const unknown = product({
    brand: "",
    model: "",
    confidence: 0.3,
    candidates: [],
    label: "Black wireless mouse",
  });
  const first = see([], [unknown]);
  const next = see(
    first.rows,
    [
      { ...unknown, id: "left-frame-item" },
      { ...unknown, id: "right-frame-item" },
    ],
    9000,
  );
  assert.equal(next.rows.length, 2);
  assert.equal(new Set(next.sightings.map((row) => row.rowId)).size, 2);
});
