import { test } from "node:test";
import assert from "node:assert/strict";
import {
  trackBox,
  frameDifference,
  trackDetection,
  DetectionTrail,
} from "../../src/client/scanner/tracking.ts";
const width = 100,
  height = 100;
let seed = 124536;
const pixels = Uint8Array.from({ length: width * height }, () => {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return seed & 255;
});
const frame = { pixels, width, height };
const box = { x: 0.2, y: 0.2, width: 0.4, height: 0.4 };
test("tracking moves a product with translated image content", () => {
  const moved = new Uint8Array(width * height);
  for (let y = 0; y < height - 3; y++)
    for (let x = 0; x < width - 4; x++)
      moved[(y + 3) * width + x + 4] = pixels[y * width + x];
  const found = trackBox(frame, { pixels: moved, width, height }, box);
  assert.ok(found);
  assert.ok(Math.abs(found.x - 0.24) < 0.015);
  assert.ok(Math.abs(found.y - 0.23) < 0.015);
});
test("textureless images cannot support a product label", () => {
  const blank = {
    pixels: new Uint8Array(width * height).fill(120),
    width,
    height,
  };
  assert.equal(trackBox(blank, blank, box), null);
});
test("a changed scene hides an old product marker", () => {
  const other = {
    pixels: Uint8Array.from(pixels, (x) => 255 - x),
    width,
    height,
  };
  assert.equal(trackBox(frame, other, box), null);
  assert.ok(frameDifference(frame, other) > 20);
  assert.equal(frameDifference(frame, frame), 0);
});

test("a recognized stationary object retains its marker between infrequent recognition requests", () => {
  const stable = { ...frame, pixels: new Uint8Array(width * height).fill(120) };
  let current = box as typeof box | null;
  for (let tick = 0; tick < 190 && current; tick++)
    current = trackDetection(stable, stable, current);
  assert.deepEqual(current, box);
});

test("adjacent-frame history projects a delayed recognition beyond the direct motion search range", async () => {
  const trail = new DetectionTrail();
  trail.begin(frame);
  let current = frame;
  for (let offset = 2; offset <= 16; offset += 2) {
    const shifted = new Uint8Array(width * height);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width - offset; x++)
        shifted[y * width + x + offset] = pixels[y * width + x];
    current = { pixels: shifted, width, height };
    trail.append(current);
  }
  assert.equal(trackBox(frame, current, box), null);
  const found = (await trail.projectMany([box], new AbortController().signal))
    ?.boxes[0];
  assert.ok(found);
  assert.ok(Math.abs(found.x - 0.36) < 0.015);
  assert.ok(Math.abs(found.y - 0.2) < 0.015);
});

test("a scene cut during recognition invalidates its delayed boxes even if the old scene returns", async () => {
  const trail = new DetectionTrail();
  trail.begin(frame);
  trail.append({
    ...frame,
    pixels: Uint8Array.from(pixels, (value) => 255 - value),
  });
  trail.append(frame);
  assert.equal(
    (await trail.projectMany([box], new AbortController().signal))?.boxes[0],
    null,
  );
});

test("bounded frame history and source replacement cannot replay stale detections", async () => {
  const trail = new DetectionTrail();
  trail.begin(frame);
  for (let tick = 0; tick < 1000; tick++) trail.append(frame);
  assert.equal(
    await trail.projectMany([box], new AbortController().signal),
    null,
  );
  trail.begin(frame);
  trail.clear();
  assert.equal(
    await trail.projectMany([box], new AbortController().signal),
    null,
  );
});

test("small moving objects are not treated as stationary merely because most of the scene is unchanged", () => {
  const small = { x: 0.4, y: 0.4, width: 0.12, height: 0.12 };
  const before = { ...frame, pixels: new Uint8Array(width * height).fill(100) };
  const after = { ...before, pixels: before.pixels.slice() };
  for (let y = 40; y < 52; y++)
    for (let x = 40; x < 52; x++) before.pixels[y * width + x] = 180;
  assert.ok(frameDifference(before, after) < 3);
  assert.equal(trackDetection(before, after, small), null);
});

test("tracking finds textured packaging edges when the object center is plain", () => {
  const sparse = new Uint8Array(width * height).fill(100);
  for (const [cx, cy] of [
    [26, 26],
    [54, 26],
    [26, 54],
  ])
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++)
        sparse[(cy + dy) * width + cx + dx] =
          pixels[(cy + dy) * width + cx + dx];
  const translated = new Uint8Array(width * height).fill(100);
  for (let y = 0; y < height - 3; y++)
    for (let x = 0; x < width - 4; x++)
      translated[(y + 3) * width + x + 4] = sparse[y * width + x];
  const found = trackBox(
    { pixels: sparse, width, height },
    { pixels: translated, width, height },
    box,
  );
  assert.ok(found);
  assert.ok(Math.abs(found.x - 0.24) < 0.015);
  assert.ok(Math.abs(found.y - 0.23) < 0.015);
});

test("delayed projection yields to UI tasks and includes frames appended while catching up", async (t) => {
  let clock = 0;
  t.mock.method(performance, "now", () => (clock += 3));
  const trail = new DetectionTrail();
  trail.begin(frame);
  for (let i = 0; i < 12; i++) trail.append(frame);
  const shifted = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width - 4; x++)
      shifted[y * width + x + 4] = pixels[y * width + x];
  const latest = { pixels: shifted, width, height };
  let handledInput = false;
  setTimeout(() => {
    handledInput = true;
    trail.append(latest);
  }, 0);
  const result = await trail.projectMany(
    [box, { ...box, x: 0.3 }],
    new AbortController().signal,
  );
  assert.ok(handledInput, "input must run before a long projection completes");
  assert.equal(result?.frame, latest);
  assert.ok(result?.boxes[0]);
  assert.ok(Math.abs(result.boxes[0].x - 0.24) < 0.015);
  assert.ok(result.boxes[1]);
  assert.ok(Math.abs(result.boxes[1].x - 0.34) < 0.015);
});

test("cancelling while projection yields cannot publish old video markers", async (t) => {
  let clock = 0;
  t.mock.method(performance, "now", () => (clock += 3));
  const trail = new DetectionTrail();
  trail.begin(frame);
  for (let i = 0; i < 12; i++) trail.append(frame);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 0);
  assert.equal(await trail.projectMany([box], controller.signal), null);
});

test("replacing or overflowing a trail during projection discards the previous generation", async (t) => {
  let clock = 0;
  t.mock.method(performance, "now", () => (clock += 3));
  for (const overflow of [false, true]) {
    const trail = new DetectionTrail();
    trail.begin(frame);
    for (let i = 0; i < 12; i++) trail.append(frame);
    setTimeout(() => {
      if (overflow) for (let i = 0; i < 400; i++) trail.append(frame);
      else trail.begin(frame);
    }, 0);
    assert.equal(
      await trail.projectMany([box], new AbortController().signal),
      null,
    );
  }
});

test("async projection cannot restore markers after an intervening scene cut", async () => {
  const trail = new DetectionTrail();
  trail.begin(frame);
  trail.append({
    ...frame,
    pixels: Uint8Array.from(pixels, (value) => 255 - value),
  });
  trail.append(frame);
  const result = await trail.projectMany([box], new AbortController().signal);
  assert.deepEqual(result?.boxes, [null]);
});
