import test from "node:test";
import assert from "node:assert/strict";
import { sameObjectAfterPan } from "../../src/client/scanner/visual-return.ts";
import type { GrayFrame } from "../../src/client/scanner/tracking.ts";
const box = { x: 0.1, y: 0.1, width: 0.7, height: 0.7 };
const original = (): GrayFrame => ({
  width: 90,
  height: 160,
  pixels: Uint8Array.from({ length: 14400 }, (_, i) =>
    Math.floor(i / 90) < 88 ? 150 : 50 + ((i * 29) % 150),
  ),
});
test("repeated detail and a plain screen still match after a small camera pan", () => {
  const a = original(),
    b = { ...a, pixels: new Uint8Array(a.pixels.length) };
  for (let y = 0; y < 160; y++)
    for (let x = 0; x < 84; x++)
      b.pixels[y * 90 + x + 6] = a.pixels[y * 90 + x];
  assert.equal(
    sameObjectAfterPan(a, b, box, { ...box, x: box.x + 6 / 90 }),
    true,
  );
});
test("flat scenes, replaced object regions and different frame sizes cannot prove a returning object", () => {
  const a = original(),
    b = { ...a, pixels: a.pixels.slice() };
  for (let y = 25; y < 75; y++)
    for (let x = 18; x < 60; x++) b.pixels[y * 90 + x] = 35;
  assert.equal(sameObjectAfterPan(a, b, box, box), false);
  const flat = { ...a, pixels: new Uint8Array(14400).fill(150) };
  assert.equal(sameObjectAfterPan(flat, flat, box, box), false);
  assert.equal(
    sameObjectAfterPan(a, { ...a, width: 160, height: 90 }, box, box),
    false,
  );
});
test("a small remembered object cannot claim a larger incoming object containing it", () => {
  let seed = 13;
  const frame: GrayFrame = {
    width: 160,
    height: 90,
    pixels: Uint8Array.from({ length: 14400 }, () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return seed & 255;
    }),
  };
  assert.equal(
    sameObjectAfterPan(
      frame,
      frame,
      { x: 0.3, y: 0.3, width: 0.2, height: 0.2 },
      { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
    ),
    false,
  );
});
test("a featureless replacement cannot inherit the older object's identity", () => {
  const previous: GrayFrame = {
    width: 160,
    height: 160,
    pixels: new Uint8Array(25600).fill(100),
  };
  for (const x of [5, 45, 85, 125])
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        previous.pixels[(5 + dy) * 160 + x + dx] = 255;
  const current = { ...previous, pixels: new Uint8Array(25600).fill(100) };
  const full = { x: 0, y: 0, width: 1, height: 1 };
  assert.equal(sameObjectAfterPan(previous, current, full, full), false);
});
