import test from "node:test";
import assert from "node:assert/strict";
import { SceneMemory } from "../../src/client/scanner/scene-memory.ts";
import type { GrayFrame } from "../../src/client/scanner/tracking.ts";
const scene = (): GrayFrame => ({
  width: 80,
  height: 48,
  pixels: Uint8Array.from(
    { length: 80 * 48 },
    (_, i) => 40 + ((i * 13 + Math.floor(i / 80) * 31) % 160),
  ),
});
test("successful views are reused after the former 30-second rescan window and on return", () => {
  const memory = new SceneMemory();
  const frame = scene();
  memory.remember(frame, ["item"]);
  assert.deepEqual(memory.match(frame, new Set(["item"])), ["item"]);
  const other = { ...frame, pixels: frame.pixels.map((v) => 255 - v) };
  assert.equal(memory.match(other, new Set(["item"])), null);
  assert.deepEqual(memory.match(frame, new Set(["item"])), ["item"]);
});
test("minor lighting noise is ignored but a small new product is analyzed", () => {
  const memory = new SceneMemory();
  const frame = scene();
  memory.remember(frame, ["item"]);
  assert.deepEqual(
    memory.match(
      { ...frame, pixels: frame.pixels.map((v) => v + 2) },
      new Set(["item"]),
    ),
    ["item"],
  );
  const changed = { ...frame, pixels: frame.pixels.slice() };
  for (let y = 16; y < 24; y++)
    for (let x = 32; x < 40; x++) changed.pixels[y * 80 + x] = 250;
  assert.equal(memory.match(changed, new Set(["item"])), null);
});
test("missing rows, new source and empty detections cannot suppress recognition", () => {
  const memory = new SceneMemory();
  const frame = scene();
  memory.remember(frame, []);
  assert.equal(memory.match(frame, new Set()), null);
  memory.remember(frame, ["item"]);
  assert.equal(memory.match(frame, new Set()), null);
  memory.clear();
  assert.equal(memory.match(frame, new Set(["item"])), null);
});
test("scene memory stays bounded and cannot match a different aspect ratio", () => {
  const memory = new SceneMemory();
  const frame = scene();
  for (let i = 0; i < 20; i++) memory.remember(frame, [`item-${i}`]);
  assert.equal(memory.match(frame, new Set(["item-0"])), null);
  assert.equal(
    memory.match({ ...frame, width: 48, height: 80 }, new Set(["item-19"])),
    null,
  );
});
