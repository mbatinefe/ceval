import { test } from "node:test";
import assert from "node:assert/strict";
import { ScanWork } from "../../src/client/scanner/work.ts";
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const tick = () => new Promise((r) => setImmediate(r));
test("a slow price search does not block recognition of the next frame", async () => {
  const work = new ScanWork(),
    price = deferred();
  let frames = 0;
  work.start();
  await work.recognize(async () => {
    frames++;
    work.compare("first", async () => {
      await price.promise;
    });
  });
  await work.recognize(async () => {
    frames++;
  });
  assert.equal(frames, 2);
  assert.equal(work.state.pending, 1);
  price.resolve();
  await tick();
  assert.equal(work.state.pending, 0);
});
test("video end drains recognition and its price searches without aborting", async () => {
  const work = new ScanWork(),
    recognition = deferred(),
    price = deferred();
  let complete = false,
    signal!: AbortSignal;
  work.start();
  const pending = work.recognize(async (s) => {
    signal = s;
    await recognition.promise;
    work.compare("item", async () => {
      await price.promise;
      complete = true;
    });
  });
  work.finishInput();
  assert.equal(signal.aborted, false);
  assert.equal(work.state.draining, true);
  recognition.resolve();
  await pending;
  assert.equal(work.state.draining, true);
  let extraFrame = false;
  await work.recognize(async () => {
    extraFrame = true;
  });
  assert.equal(extraFrame, false);
  price.resolve();
  await tick();
  assert.equal(complete, true);
  assert.equal(work.state.draining, false);
});
test("searches are deduplicated and one reservation is active while the next waits", async () => {
  const work = new ScanWork(),
    first = deferred(),
    second = deferred();
  const started: string[] = [];
  work.start();
  for (const key of ["a", "a", "b", "c"])
    work.compare(key, async () => {
      started.push(key);
      await (key === "a" ? first.promise : second.promise);
    });
  assert.deepEqual(started, ["a"]);
  assert.equal(work.state.pending, 3);
  first.resolve();
  await tick();
  assert.deepEqual(started, ["a", "b"]);
  assert.equal(work.state.pending, 2);
  second.resolve();
  await tick();
  assert.deepEqual(started, ["a", "b", "c"]);
  assert.equal(work.state.pending, 0);
});
test("explicit cancellation aborts active work, drops queued work and isolates a new run", async () => {
  const work = new ScanWork(),
    old = deferred(),
    next = deferred();
  const signals: AbortSignal[] = [],
    started: string[] = [];
  work.start();
  const prior = work.recognize(async (s) => {
    signals.push(s);
    await old.promise;
  });
  for (const key of ["a", "b", "queued"])
    work.compare(key, async (s) => {
      signals.push(s);
      started.push(key);
      await old.promise;
    });
  work.cancel();
  assert.ok(signals.every((s) => s.aborted));
  work.start();
  const current = work.recognize(async () => {
    await next.promise;
  });
  old.resolve();
  await prior;
  await tick();
  assert.equal(work.state.recognizing, true);
  assert.deepEqual(started, ["a"]);
  next.resolve();
  await current;
  assert.equal(work.state.recognizing, false);
});

test("a failed later recognition stops capture but drains earlier comparisons", async () => {
  const work = new ScanWork(),
    prices = deferred();
  const completed: string[] = [];
  let priceSignal!: AbortSignal;
  work.start();
  await work.recognize(async () => {
    for (const key of ["a", "b", "c"])
      work.compare(key, async (signal) => {
        priceSignal = signal;
        await prices.promise;
        completed.push(key);
      });
  });
  await assert.rejects(
    work.recognize(async () => {
      throw new Error("Recognition quota reached");
    }),
  );
  assert.equal(priceSignal.aborted, false);
  assert.equal(work.state.draining, true);
  let extraFrame = false;
  await work.recognize(async () => {
    extraFrame = true;
  });
  assert.equal(extraFrame, false);
  prices.resolve();
  await tick();
  assert.deepEqual(completed, ["a", "b", "c"]);
  assert.equal(work.state.draining, false);
});

test("model confirmation finishes independently of a slow price search and drains at video end", async () => {
  const work = new ScanWork(),
    price = deferred(),
    selection = deferred();
  const confirmed: string[] = [],
    started: string[] = [];
  work.start();
  work.compare("price", async () => {
    await price.promise;
  });
  for (const key of ["first", "first", "second"])
    work.select(key, async () => {
      started.push(key);
      await selection.promise;
      confirmed.push(key);
    });
  assert.deepEqual(started, ["first"]);
  assert.equal(work.state.pending, 3);
  work.finishInput();
  assert.equal(work.state.draining, true);
  selection.resolve();
  await tick();
  assert.deepEqual(confirmed, ["first", "second"]);
  assert.equal(work.state.pending, 1, "only the slow price search remains");
  assert.equal(work.state.draining, true);
  price.resolve();
  await tick();
  assert.equal(work.state.draining, false);
});

test("cancellation aborts both lanes and discards queued confirmations without disturbing a new run", async () => {
  const work = new ScanWork(),
    old = deferred(),
    next = deferred();
  const oldSignals: AbortSignal[] = [],
    started: string[] = [];
  work.start();
  work.compare("price", async (signal) => {
    oldSignals.push(signal);
    await old.promise;
  });
  for (const key of ["first", "queued"])
    work.select(key, async (signal) => {
      oldSignals.push(signal);
      started.push(key);
      await old.promise;
    });
  assert.equal(oldSignals.length, 2);
  work.cancel();
  assert.ok(oldSignals.every((signal) => signal.aborted));
  assert.equal(work.state.pending, 0);
  work.start();
  work.compare("price", async () => {
    await next.promise;
  });
  work.select("first", async () => {
    started.push("new");
    await next.promise;
  });
  old.resolve();
  await tick();
  assert.deepEqual(started, ["first", "new"]);
  assert.equal(work.state.pending, 2);
  next.resolve();
  await tick();
  assert.equal(work.state.pending, 0);
});

test("both lanes share the total queue bound while deduplicating their own work", async () => {
  const work = new ScanWork(),
    release = deferred();
  const started: string[] = [];
  work.start();
  for (let i = 0; i < 12; i++) {
    const task = async () => {
      started.push(String(i));
      await release.promise;
    };
    assert.equal(
      i % 2 ? work.compare(String(i), task) : work.select(String(i), task),
      true,
    );
  }
  assert.equal(work.state.pending, 12);
  assert.deepEqual(started, ["0", "1"]);
  assert.equal(
    work.select("extra", async () => {}),
    false,
  );
  assert.equal(
    work.compare("extra", async () => {}),
    false,
  );
  assert.equal(
    work.select("0", async () => {
      throw new Error("duplicate ran");
    }),
    true,
  );
  assert.equal(
    work.compare("1", async () => {
      throw new Error("duplicate ran");
    }),
    true,
  );
  assert.equal(work.state.pending, 12);
  release.resolve();
  await tick();
  assert.equal(started.length, 12);
  assert.equal(work.state.pending, 0);
});
