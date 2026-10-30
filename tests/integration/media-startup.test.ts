import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MediaStartup,
  cameraFailure,
  mediaReadiness,
} from "../../src/client/scanner/startup.ts";

const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

test("source choice waits for media preparation and provider availability, then starts once", async () => {
  const startup = new MediaStartup();
  let plays = 0;
  const play = async () => {
    plays++;
  };
  assert.equal(await startup.attempt(true, true, play), "idle");
  startup.arm();
  assert.equal(await startup.attempt(false, true, play), "idle");
  assert.equal(await startup.attempt(true, false, play), "idle");
  assert.equal(plays, 0);
  assert.equal(await startup.attempt(true, true, play), "started");
  assert.equal(await startup.attempt(true, true, play), "idle");
  assert.equal(plays, 1);
});

test("duplicate readiness events do not race a pending play promise", async () => {
  const startup = new MediaStartup(),
    playback = deferred();
  startup.arm();
  const attempt = startup.attempt(true, true, () => playback.promise);
  assert.equal(startup.state, "starting");
  assert.equal(
    await startup.attempt(true, true, async () =>
      assert.fail("duplicate playback"),
    ),
    "idle",
  );
  playback.resolve();
  assert.equal(await attempt, "started");
});

test("stop or background cancellation prevents late availability from starting playback", async () => {
  const startup = new MediaStartup();
  startup.arm();
  await startup.attempt(true, false, async () =>
    assert.fail("provider unavailable"),
  );
  startup.cancel();
  assert.equal(
    await startup.attempt(true, true, async () =>
      assert.fail("cancelled playback"),
    ),
    "idle",
  );
});

test("source replacement invalidates old play success without consuming the new source", async () => {
  const startup = new MediaStartup(),
    oldPlayback = deferred();
  startup.arm();
  const old = startup.attempt(true, true, () => oldPlayback.promise);
  startup.arm();
  oldPlayback.resolve();
  assert.equal(await old, "cancelled");
  assert.equal(startup.state, "waiting");
  assert.equal(await startup.attempt(true, true, async () => {}), "started");
});

test("late playback rejection after cancellation cannot show a fallback for another source", async () => {
  const startup = new MediaStartup(),
    playback = deferred();
  startup.arm();
  const attempt = startup.attempt(true, true, () => playback.promise);
  startup.cancel();
  playback.reject(new DOMException("Aborted", "AbortError"));
  assert.equal(await attempt, "cancelled");
  assert.equal(startup.state, "idle");
});

test("autoplay rejection requires an explicit retry instead of looping on media events", async () => {
  const startup = new MediaStartup();
  startup.arm();
  assert.equal(
    await startup.attempt(true, true, async () => {
      throw new DOMException("Gesture required", "NotAllowedError");
    }),
    "blocked",
  );
  assert.equal(startup.state, "blocked");
  assert.equal(
    await startup.attempt(true, true, async () =>
      assert.fail("unexpected automatic retry"),
    ),
    "idle",
  );
  startup.arm();
  assert.equal(await startup.attempt(true, true, async () => {}), "started");
});

test("metadata and dimensions alone cannot start frame analysis", () => {
  const media = {
    readyState: 1,
    videoWidth: 1920,
    videoHeight: 1080,
    duration: 25,
  };
  assert.equal(mediaReadiness(media, false), "loading");
  assert.equal(mediaReadiness({ ...media, readyState: 2 }, false), "ready");
  assert.equal(
    mediaReadiness({ ...media, readyState: 2, videoWidth: 0 }, false),
    "loading",
  );
  assert.equal(mediaReadiness({ ...media, duration: NaN }, false), "loading");
  assert.equal(
    mediaReadiness({ ...media, readyState: 2, duration: 601 }, false),
    "invalid",
  );
  assert.equal(
    mediaReadiness({ ...media, readyState: 2, duration: Infinity }, true),
    "ready",
  );
});

test("camera errors distinguish permission recovery, absent hardware and busy devices", () => {
  assert.equal(
    cameraFailure(new DOMException("Denied", "NotAllowedError")).kind,
    "permission",
  );
  assert.equal(
    cameraFailure(new DOMException("Policy", "SecurityError")).kind,
    "permission",
  );
  assert.equal(
    cameraFailure(new DOMException("Absent", "NotFoundError")).kind,
    "missing",
  );
  assert.equal(
    cameraFailure(new DOMException("Busy", "NotReadableError")).kind,
    "busy",
  );
  assert.equal(cameraFailure(new Error("Unknown")).kind, "unknown");
});

test("camera preview plays while analysis is unavailable without starting analysis", async () => {
  const startup = new MediaStartup();
  let previewFrames = 0;
  startup.arm();
  assert.equal(
    await startup.preview(async () => {
      previewFrames++;
    }),
    "playing",
  );
  assert.equal(previewFrames, 1);
  assert.equal(
    await startup.attempt(true, false, async () =>
      assert.fail("analysis must remain unavailable"),
    ),
    "idle",
  );
  assert.equal(startup.state, "waiting");
});

test("blocked camera preview can retry independently without rearming stopped scanning", async () => {
  const startup = new MediaStartup();
  startup.arm();
  assert.equal(
    await startup.preview(async () => {
      throw new DOMException("Gesture required", "NotAllowedError");
    }),
    "blocked",
  );
  startup.cancel();
  assert.equal(await startup.preview(async () => {}), "playing");
  assert.equal(
    await startup.attempt(true, true, async () =>
      assert.fail("preview retry must not restart analysis"),
    ),
    "idle",
  );
});

test("late camera preview resolution or rejection cannot update a replaced source", async () => {
  for (const rejects of [false, true]) {
    const startup = new MediaStartup(),
      playback = deferred();
    startup.arm();
    const attempt = startup.preview(() => playback.promise);
    startup.cancel();
    startup.arm();
    if (rejects)
      playback.reject(new DOMException("Playback aborted", "AbortError"));
    else playback.resolve();
    assert.equal(await attempt, "cancelled");
    assert.equal(startup.state, "waiting");
  }
});
