import { test } from "node:test";
import assert from "node:assert/strict";
import {
  trackBox,
  frameDifference,
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
