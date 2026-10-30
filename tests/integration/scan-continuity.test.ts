import { test } from "node:test";
import assert from "node:assert/strict";
import {
  reconcileSightings,
  type FoundProduct,
} from "../../src/client/scanner/continuity.ts";
import type { Product, Comparison } from "../../src/shared/scan.ts";
import type { GrayFrame } from "../../src/client/scanner/tracking.ts";
import * as continuity from "../../src/client/scanner/continuity.ts";

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

function detailedFrame(seed = 72183): GrayFrame {
  return {
    width: 160,
    height: 90,
    pixels: Uint8Array.from({ length: 160 * 90 }, () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return seed & 255;
    }),
  };
}

test("unchanged background cannot carry a selected model and price onto a replaced object", () => {
  const visual = detailedFrame(2);
  const unknown = product({
    model: "",
    confidence: 0.4,
    candidates: [candidate("Logitech", "MX Master 3S")],
    box: { x: 0.2, y: 0.2, width: 0.5, height: 0.6 },
  });
  const first = see([], [unknown], 1000, visual);
  const selected = product({
    ...unknown,
    id: "selected",
    model: "MX Master 3S",
    confidence: 1,
    identification: "user_selected",
    candidates: undefined,
  });
  first.rows[0] = {
    ...first.rows[0],
    product: selected,
    comparison: comparison(selected),
  };
  const replaced = { ...visual, pixels: visual.pixels.slice() };
  for (let y = 28; y <= 61; y++)
    for (let x = 42; x <= 101; x++)
      replaced.pixels[y * 160 + x] = 255 - visual.pixels[y * 160 + x];
  const next = see(first.rows, [{ ...unknown, id: "new" }], 140000, replaced);
  assert.equal(next.rows.length, 2);
  assert.equal(next.sightings[0].product.id, "new");
  assert.equal(next.sightings[0].product.model, "");
  assert.equal(next.sightings[0].comparison, undefined);
});

for (const [label, time] of [
  ["nearby", 9000],
  ["returning", 140000],
] as const)
  test(`a ${label} changed detection crop retains an uncertain item when image features stay in place`, () => {
    const visual = detailedFrame();
    const headphones = product({
      brand: "Sony",
      model: "",
      confidence: 0.4,
      label: "Sony over-ear headphones",
      candidates: [
        candidate("Sony", "WH-1000XM3"),
        candidate("Sony", "WH-1000XM4"),
      ],
      box: { x: 0.4, y: 0.25, width: 0.4, height: 0.45 },
    });
    const first = see([], [headphones], 1000, visual);
    const incoming = {
      ...headphones,
      id: "wider-crop",
      label: "Black wireless headphones",
      box: { x: 0.38, y: 0.22, width: 0.44, height: 0.51 },
    };
    const next = see(first.rows, [incoming], time, visual);
    assert.equal(next.rows.length, 1);
    assert.equal(next.rows[0].rowId, first.rows[0].rowId);
    assert.equal(next.rows[0].product.id, "wider-crop");
    assert.equal(next.rows[0].product.model, "");
  });

test("crop continuity cannot merge a different object, empty texture, or adjacent matching model", () => {
  const visual = detailedFrame();
  const unknown = product({
    model: "",
    confidence: 0.4,
    candidates: [candidate("Logitech", "MX Master 3S")],
    box: { x: 0.15, y: 0.25, width: 0.25, height: 0.4 },
  });
  const first = see([], [unknown], 1000, visual);
  const changed = {
    ...visual,
    pixels: Uint8Array.from(visual.pixels, (v) => 255 - v),
  };
  const next = {
    ...unknown,
    id: "other",
    box: { x: 0.14, y: 0.2, width: 0.3, height: 0.5 },
  };
  assert.equal(see(first.rows, [next], 9000, changed).rows.length, 2);
  const flat = {
    ...visual,
    pixels: new Uint8Array(visual.pixels.length).fill(100),
  };
  const empty = see([], [unknown], 1000, flat);
  assert.equal(see(empty.rows, [next], 9000, flat).rows.length, 2);
  const neighbors = see(
    first.rows,
    [
      next,
      {
        ...unknown,
        id: "neighbor",
        box: { x: 0.65, y: 0.25, width: 0.25, height: 0.4 },
      },
    ],
    9000,
    visual,
  );
  assert.equal(neighbors.rows.length, 2);
  assert.equal(neighbors.sightings[0].rowId, first.rows[0].rowId);
  assert.notEqual(neighbors.sightings[1].rowId, first.rows[0].rowId);
});

test("a lateral pan and wider detector crop keep the same uncertain find", () => {
  const visual = detailedFrame();
  const moved = { ...visual, pixels: new Uint8Array(visual.pixels.length) };
  for (let y = 0; y < visual.height; y++)
    for (let x = 14; x < visual.width; x++)
      moved.pixels[y * visual.width + x] =
        visual.pixels[y * visual.width + x - 14];
  const unknown = product({
    model: "",
    confidence: 0.4,
    candidates: [candidate("Logitech", "MX Master 3S")],
    box: { x: 0.35, y: 0.25, width: 0.35, height: 0.4 },
  });
  const first = see([], [unknown], 1000, visual);
  const next = see(
    first.rows,
    [
      {
        ...unknown,
        id: "panned",
        box: { x: 0.4, y: 0.2, width: 0.46, height: 0.52 },
      },
    ],
    10000,
    moved,
  );
  assert.equal(next.rows.length, 1);
  assert.equal(next.rows[0].rowId, first.rows[0].rowId);
});

function crowdedScene() {
  const visual = detailedFrame(2);
  const unknown = product({
    model: "",
    confidence: 0.4,
    candidates: [candidate("Logitech", "MX Master 3S")],
    box: { x: 0.2, y: 0.2, width: 0.5, height: 0.6 },
  });
  const rows = see(
    [],
    Array.from({ length: 30 }, (_, i) => ({ ...unknown, id: `old-${i}` })),
    1000,
    visual,
  ).rows;
  const products = Array.from({ length: 3 }, (_, i) => ({
    ...unknown,
    id: `new-${i}`,
    box: { ...unknown.box, x: 0.22 + i * 0.02 },
  }));
  const context = {
    time: 140,
    now: 140000,
    frame: {
      ...visual,
      pixels: Uint8Array.from(visual.pixels, (v) => 255 - v),
    },
    mode: "buy" as const,
    market: "US" as const,
    cache: new Map<string, Comparison>(),
  };
  return { rows, products, context };
}

test("crowded matching lets browser tasks run before publishing the completed sightings", async () => {
  const { rows, products, context } = crowdedScene();
  let responsive = false;
  const timer = setTimeout(() => {
    responsive = true;
  }, 0);
  const result = await continuity.reconcileCurrentSightings(
    () => rows,
    products,
    context,
    new AbortController().signal,
    () => true,
    () => {},
  );
  clearTimeout(timer);
  assert.equal(responsive, true);
  assert.equal(result?.sightings.length, 3);
  assert.ok(result.sightings.every((row) => row.product.id.startsWith("new-")));
});

for (const reason of ["cancel", "generation"] as const)
  test(`matching discards work after ${reason} changes during a browser yield`, async () => {
    const { rows, products, context } = crowdedScene();
    const controller = new AbortController();
    let current = true;
    const timer = setTimeout(() => {
      if (reason === "cancel") controller.abort();
      else current = false;
    }, 0);
    const result = await continuity.reconcileCurrentSightings(
      () => rows,
      products,
      context,
      controller.signal,
      () => current,
      () => assert.fail("Cancelled matching must not publish"),
    );
    clearTimeout(timer);
    assert.equal(result, null);
  });

test("a model chosen during matching remains authoritative when matching resumes", async () => {
  const { rows: initial, products, context } = crowdedScene();
  let rows = initial;
  const chosen = product({
    id: "selected-during-yield",
    identification: "user_selected",
  });
  const timer = setTimeout(() => {
    rows = [
      { ...initial[0], product: chosen, comparison: comparison(chosen) },
      ...initial.slice(1),
    ];
  }, 0);
  const result = await continuity.reconcileCurrentSightings(
    () => rows,
    products,
    { ...context, frame: initial[0].sighting!.frame! },
    new AbortController().signal,
    () => true,
    () => {},
  );
  clearTimeout(timer);
  const retained = result?.rows.find((row) => row.rowId === initial[0].rowId);
  assert.equal(retained?.product.id, "selected-during-yield");
  assert.equal(retained?.comparison?.product.id, "selected-during-yield");
});

test("matching publishes before handing control to a queued model confirmation", async () => {
  const unknown = product({
    model: "",
    confidence: 0.4,
    candidates: [candidate("Logitech", "MX Master 3S")],
  });
  let rows = see([], [unknown]).rows.map((row) => ({
    ...row,
    selecting: true,
  }));
  const selected = product({
    id: "selected-in-microtask",
    identification: "user_selected",
  });
  let publishedAtConfirmation = 0;
  queueMicrotask(() => {
    publishedAtConfirmation = rows[0].sighting!.at;
    rows = rows.map((row) => ({
      ...row,
      product: selected,
      selecting: false,
      comparison: comparison(selected),
    }));
  });
  await continuity.reconcileCurrentSightings(
    () => rows,
    [{ ...unknown, id: "latest-sighting" }],
    { time: 9, now: 9000, frame, mode: "buy", market: "US", cache: new Map() },
    new AbortController().signal,
    () => true,
    (result) => {
      rows = result.rows;
    },
  );
  assert.equal(publishedAtConfirmation, 9000);
  assert.equal(rows[0].product.id, "selected-in-microtask");
  assert.equal(rows[0].selecting, false);
  assert.equal(rows[0].comparison?.product.id, "selected-in-microtask");
});

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

test("a unique exact model gains its missing variant despite detector box jitter in the same scene", () => {
  const first = see(
    [],
    [
      product({
        variant: "",
        box: { x: 0.1, y: 0.1, width: 0.6, height: 0.6 },
      }),
    ],
  );
  const next = see(
    first.rows,
    [
      product({
        id: "black-label",
        box: { x: 0.12, y: 0.13, width: 0.59, height: 0.58 },
      }),
    ],
    14000,
  );
  assert.equal(next.rows.length, 1);
  assert.equal(next.rows[0].product.id, "black-label");
  assert.equal(next.rows[0].product.variant, "Black");
});

test("a missing variant cannot choose between multiple established colorways", () => {
  const first = see(
    [],
    [product(), product({ id: "white", variant: "White" })],
  );
  const next = see(
    first.rows,
    [product({ id: "unreadable-color", variant: "" })],
    14000,
  );
  assert.equal(next.rows.length, 3);
});

test("Sony alpha notation refers to the same camera while different generations remain separate", () => {
  const camera = product({
    brand: "Sony",
    model: "a6000",
    variant: "Black, body only",
  });
  let rows = see([], [camera]).rows;
  for (const model of ["α6000", "Alpha 6000"])
    rows = see(
      rows,
      [product({ brand: "Sony", model, variant: "Black", id: model })],
      14000,
    ).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].product.variant, "Black, body only");
  assert.equal(
    see(
      rows,
      [product({ brand: "Sony", model: "a6100", id: "next-generation" })],
      15000,
    ).rows.length,
    2,
  );
});

test("bare Sony camera numbers require unique visual evidence and cannot normalize other brands", () => {
  const camera = product({ brand: "Sony", model: "α6000" });
  const first = see([], [camera]);
  const next = see(
    first.rows,
    [{ ...camera, id: "bare", model: "6000" }],
    14000,
  );
  assert.equal(next.rows.length, 1);
  const other = {
    ...frame,
    pixels: Uint8Array.from(frame.pixels, (value) => 255 - value),
  };
  assert.equal(
    see(
      first.rows,
      [{ ...camera, id: "different", model: "6000" }],
      14000,
      other,
    ).rows.length,
    2,
  );
  const anotherBrand = see([], [{ ...camera, brand: "Acme" }]);
  assert.equal(
    see(
      anotherBrand.rows,
      [{ ...camera, brand: "Acme", model: "6000", id: "different" }],
      14000,
    ).rows.length,
    2,
  );
});

test("uncertain carrying-case wording can vary when the branded object appearance is unchanged", () => {
  const carryingCase = product({
    brand: "Sony",
    model: "",
    confidence: 0.3,
    label: "Sony Headphone Carrying Case (Black)",
    candidates: [],
  });
  let rows = see([], [carryingCase]).rows;
  for (const [index, label] of [
    "Sony headphone carrying case",
    "Sony black zip headphone carrying case",
  ].entries()) {
    rows = see(
      rows,
      [{ ...carryingCase, id: `case-${index}`, label }],
      14000,
    ).rows;
    assert.equal(rows.length, 1);
  }
  assert.equal(rows[0].product.model, "");
  assert.equal(rows[0].product.confidence, 0.3);
});

test("a repeated unknown case tolerates a slightly shifted detection crop within the same scene", () => {
  let seed = 12532;
  const detailed = {
    ...frame,
    pixels: Uint8Array.from(frame.pixels, () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return seed & 255;
    }),
  };
  const carryingCase = product({
    brand: "Sony",
    model: "",
    confidence: 0.3,
    label: "Sony headphone carrying case",
    candidates: [],
    box: { x: 0, y: 0, width: 0.75, height: 0.75 },
  });
  const first = see([], [carryingCase], 1000, detailed);
  const next = see(
    first.rows,
    [
      {
        ...carryingCase,
        id: "new-crop",
        label: "Sony black zip headphone carrying case",
        box: { x: 0.0625, y: 0.0625, width: 0.75, height: 0.75 },
      },
    ],
    140000,
    detailed,
  );
  assert.equal(next.rows.length, 1);
  assert.equal(next.rows[0].rowId, first.rows[0].rowId);
  assert.equal(next.rows[0].product.model, "");
});

test("unique exact Sony aliases preserve richer descriptive variants across a changed scene", () => {
  const camera = product({
    brand: "Sony",
    model: "α6000",
    variant: "Black, body only",
  });
  const first = see([], [camera]);
  const otherScene = {
    ...frame,
    pixels: Uint8Array.from(frame.pixels, (value) => 255 - value),
  };
  const next = see(
    first.rows,
    [{ ...camera, id: "return", model: "Alpha 6000", variant: "Black" }],
    140000,
    otherScene,
  );
  assert.equal(next.rows.length, 1);
  assert.equal(next.rows[0].rowId, first.rows[0].rowId);
  assert.equal(next.rows[0].product.id, camera.id);
  assert.equal(next.rows[0].product.variant, "Black, body only");
});

test("exact model identity cannot discard a capacity or color variant on a changed scene", () => {
  const first = see([], [product({ variant: "Black, 64GB" })]);
  const otherScene = {
    ...frame,
    pixels: Uint8Array.from(frame.pixels, (value) => 255 - value),
  };
  for (const variant of ["Black", "Black, 128GB", "White, 64GB"])
    assert.equal(
      see(
        first.rows,
        [product({ id: "different-variant", variant })],
        140000,
        otherScene,
      ).rows.length,
      2,
    );
});
test("a returning item keeps its photo and history identity when its authoritative snapshot changes", () => {
  const first = reconcileSightings([], [product()], {
    time: 1,
    now: 1000,
    frame,
    mode: "buy",
    market: "US",
    cache: new Map(),
    photos: new Map([["first", "data:image/jpeg;base64,original-crop"]]),
  });
  assert.ok(first.rows[0].historyId);
  assert.equal(first.rows[0].thumbnail, "data:image/jpeg;base64,original-crop");
  const next = see(
    first.rows,
    [product({ id: "changed-shelf", shelfPriceMinor: 8999 })],
    2000,
  );
  assert.equal(next.rows.length, 1);
  assert.equal(next.rows[0].product.id, "changed-shelf");
  assert.equal(next.rows[0].historyId, first.rows[0].historyId);
  assert.equal(next.rows[0].thumbnail, first.rows[0].thumbnail);
});
