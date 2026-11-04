import test from "node:test";
import assert from "node:assert/strict";
import {
  trialCountdown,
  finishTrialInput,
} from "../../src/client/scanner/trial.ts";
import { CaptureBuffer } from "../../src/client/scanner/capture-buffer.ts";
import { ScanWork } from "../../src/client/scanner/work.ts";

const access = {
  durationSeconds: 600,
  startedAt: 1_000_000,
  expiresAt: 1_600_000,
  remainingSeconds: 590,
  serverNow: 1_010_000,
};

test("trial countdown uses elapsed time against the server clock, even on a device far ahead", () => {
  assert.equal(trialCountdown(access, 90_000_000, 90_018_000), 572);
});

test("trial countdown uses the server clock on a device far behind", () => {
  assert.equal(trialCountdown(access, 200, 18_200), 572);
});

test("the full ten minutes stay available until the first paid scan starts the window", () => {
  assert.equal(
    trialCountdown(
      { ...access, startedAt: null, expiresAt: null, remainingSeconds: 600 },
      100,
      3_600_100,
    ),
    600,
  );
});

test("reloading an expired trial does not create a new window", () => {
  assert.equal(
    trialCountdown(
      { ...access, remainingSeconds: 0, serverNow: 1_700_000 },
      200,
      200,
    ),
    0,
  );
});

test("remaining time rounds up partial seconds and reaches zero exactly at the deadline", () => {
  assert.equal(trialCountdown(access, 1000, 590_999), 1);
  assert.equal(trialCountdown(access, 1000, 591_000), 0);
  assert.equal(trialCountdown(access, 1000, 700_000), 0);
});

test("unrestricted accounts have no trial countdown", () => {
  assert.equal(trialCountdown(undefined, 100, 200), null);
});

test("trial expiry discards captured views while in-flight recognition and searches finish", async () => {
  const buffer = new CaptureBuffer();
  const work = new ScanWork();
  work.start();
  buffer.push({
    image: "unsubmitted",
    time: 0,
    capturedAt: 0,
    position: 0,
    gray: { width: 1, height: 1, pixels: new Uint8Array([0]) },
  });
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const completed: string[] = [];
  let requestSignal!: AbortSignal;
  const recognizing = work.recognize(async (signal) => {
    requestSignal = signal;
    await pending;
    completed.push("recognition");
  });
  work.compare("already-queued", async (signal) => {
    await pending;
    assert.equal(signal.aborted, false);
    completed.push("search");
  });
  finishTrialInput(buffer, work);
  assert.equal(buffer.length, 0);
  assert.equal(requestSignal.aborted, false);
  assert.equal(work.state.draining, true);
  await work.recognize(async () => {
    completed.push("unexpected recognition");
  });
  release();
  await recognizing;
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(completed.sort(), ["recognition", "search"]);
  assert.equal(work.state.draining, false);
});
