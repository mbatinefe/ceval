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
test("two slow price searches do not block recognition of the next frame", async () => {
  const work = new ScanWork(),
    price = deferred();
  let frames = 0;
  work.start();
  await work.recognize(async () => {
    frames++;
    for (const key of ["first", "second"])
      work.compare(key, async () => {
        await price.promise;
      });
  });
  await work.recognize(async () => {
    frames++;
  });
  assert.equal(frames, 2);
  assert.equal(work.state.pending, 2);
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
test("two distinct searches overlap while later searches wait for a free slot", async () => {
  const work = new ScanWork(),
    first = deferred(),
    second = deferred(),
    third = deferred(),
    fourth = deferred();
  const gates = { a: first, b: second, c: third, d: fourth };
  const started: string[] = [];
  work.start();
  for (const key of ["a", "a", "b", "b", "c", "c", "d"] as const)
    work.compare(key, async () => {
      started.push(key);
      await gates[key].promise;
    });
  assert.deepEqual(started, ["a", "b"]);
  assert.equal(work.state.pending, 4);
  work.finishInput();
  assert.equal(work.state.draining, true);
  second.resolve();
  await tick();
  assert.deepEqual(started, ["a", "b", "c"]);
  assert.equal(work.state.pending, 3);
  third.resolve();
  await tick();
  assert.deepEqual(started, ["a", "b", "c", "d"]);
  assert.equal(work.state.pending, 2);
  fourth.resolve();
  await tick();
  assert.equal(work.state.pending, 1, "the first search is still running");
  assert.equal(work.state.draining, true);
  first.resolve();
  await tick();
  assert.equal(work.state.pending, 0);
  assert.equal(work.state.draining, false);
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
  assert.equal(signals.length, 3);
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
  assert.deepEqual(started, ["a", "b"]);
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

test("model confirmation finishes independently of two slow price searches and drains at video end", async () => {
  const work = new ScanWork(),
    price = deferred(),
    selection = deferred();
  const confirmed: string[] = [],
    started: string[] = [];
  work.start();
  for (const key of ["price-1", "price-2"])
    work.compare(key, async () => {
      await price.promise;
    });
  for (const key of ["first", "first", "second"])
    work.select(key, async () => {
      started.push(key);
      await selection.promise;
      confirmed.push(key);
    });
  assert.deepEqual(started, ["first"]);
  assert.equal(work.state.pending, 4);
  work.finishInput();
  assert.equal(work.state.draining, true);
  selection.resolve();
  await tick();
  assert.deepEqual(confirmed, ["first", "second"]);
  assert.equal(work.state.pending, 2, "only the slow price searches remain");
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
    started: string[] = [],
    errors: unknown[] = [];
  work.onError = (error) => errors.push(error);
  work.start();
  for (const key of ["price-1", "price-2", "queued-price"])
    work.compare(key, async (signal) => {
      oldSignals.push(signal);
      started.push(key);
      await old.promise;
      throw new Error("cancelled price search");
    });
  for (const key of ["first", "queued"])
    work.select(key, async (signal) => {
      oldSignals.push(signal);
      started.push(key);
      await old.promise;
    });
  assert.equal(oldSignals.length, 3);
  work.cancel();
  assert.ok(oldSignals.every((signal) => signal.aborted));
  assert.equal(work.state.pending, 0);
  work.start();
  for (const key of ["price-1", "price-2"])
    work.compare(key, async () => {
      await next.promise;
    });
  work.select("first", async () => {
    started.push("new");
    await next.promise;
  });
  old.resolve();
  await tick();
  assert.deepEqual(started, ["price-1", "price-2", "first", "new"]);
  assert.deepEqual(errors, []);
  assert.equal(work.state.pending, 3);
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
  assert.deepEqual(started, ["0", "1", "3"]);
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

test("a failed search reports its error and frees a slot while another search is still running", async () => {
  const work = new ScanWork(),
    slow = deferred(),
    failure = deferred();
  const error = new Error("Price service unavailable");
  const errors: unknown[] = [],
    completed: string[] = [];
  work.onError = (value) => errors.push(value);
  work.start();
  work.compare("slow", async () => {
    await slow.promise;
    completed.push("slow");
  });
  work.compare("failed", async () => {
    await failure.promise;
    throw error;
  });
  work.compare("next", async () => {
    completed.push("next");
  });
  work.finishInput();
  failure.resolve();
  await tick();
  assert.deepEqual(errors, [error]);
  assert.deepEqual(completed, ["next"]);
  assert.equal(work.state.pending, 1);
  assert.equal(work.state.draining, true);
  slow.resolve();
  await tick();
  assert.deepEqual(completed, ["next", "slow"]);
  assert.equal(work.state.draining, false);
});
