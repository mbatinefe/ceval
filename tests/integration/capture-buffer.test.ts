import test from "node:test";
import assert from "node:assert/strict";
import {
  CaptureBuffer,
  type CapturedFrame,
} from "../../src/client/scanner/capture-buffer.ts";
import { ScanWork } from "../../src/client/scanner/work.ts";

const frame = (n: number, value = n * 20): CapturedFrame => ({
  image: `photo-${n}`,
  time: n * 2.5,
  capturedAt: n * 2500,
  position: 1,
  gray: { width: 4, height: 4, pixels: new Uint8Array(16).fill(value) },
});

test("frames captured while recognition is busy retain their own photo, time and view", () => {
  const buffer = new CaptureBuffer();
  for (let n = 1; n <= 7; n++) buffer.push(frame(n));
  assert.deepEqual(
    buffer.take().map((f) => [f.image, f.time, f.gray.pixels[0]]),
    [
      ["photo-1", 2.5, 20],
      ["photo-2", 5, 40],
      ["photo-3", 7.5, 60],
    ],
  );
  assert.equal(buffer.length, 4);
  assert.deepEqual(
    buffer.take().map((f) => f.image),
    ["photo-4", "photo-5", "photo-6"],
  );
  assert.deepEqual(
    buffer.take().map((f) => f.image),
    ["photo-7"],
  );
  assert.deepEqual(buffer.take(), []);
});

test("overflow is bounded and preserves endpoints and a distinctive intermediate view", () => {
  const buffer = new CaptureBuffer();
  for (let n = 0; n < 20; n++) buffer.push(frame(n, n === 10 ? 230 : 20));
  assert.equal(buffer.length, 9);
  const retained = [...buffer.take(), ...buffer.take(), ...buffer.take()];
  assert.equal(retained[0].image, "photo-0");
  assert.equal(retained.at(-1)?.image, "photo-19");
  assert.ok(retained.some((f) => f.image === "photo-10"));
  assert.deepEqual(
    retained.map((f) => f.time),
    retained.map((f) => f.time).sort((a, b) => a - b),
  );
});

test("captured frames finish after playback ends, then recognition closes and searches drain", async () => {
  const buffer = new CaptureBuffer(),
    work = new ScanWork();
  work.start();
  for (let n = 0; n < 5; n++) buffer.push(frame(n));
  let release!: () => void;
  const price = new Promise<void>((r) => {
    release = r;
  });
  const analyzed: string[] = [];
  while (buffer.length) {
    const batch = buffer.take();
    await work.recognize(async (signal) => {
      if (!buffer.length) work.finishInput();
      assert.equal(signal.aborted, false);
      analyzed.push(...batch.map((f) => f.image));
      work.compare(batch[0].image, async () => {
        await price;
      });
    });
  }
  await work.recognize(async () => {
    analyzed.push("unexpected");
  });
  assert.deepEqual(
    analyzed,
    [0, 1, 2, 3, 4].map((n) => `photo-${n}`),
  );
  assert.equal(work.state.draining, true);
  release();
  await new Promise((r) => setImmediate(r));
  assert.equal(work.state.draining, false);
});

test("source changes and cancellation discard captured frames", async () => {
  const buffer = new CaptureBuffer(),
    work = new ScanWork();
  work.start();
  buffer.push(frame(1));
  buffer.clear();
  work.cancel();
  assert.equal(buffer.length, 0);
  let called = false;
  await work.recognize(async () => {
    called = true;
  });
  assert.equal(called, false);
  buffer.push({ ...frame(2), position: 2 });
  assert.equal(buffer.take()[0].position, 2);
});
