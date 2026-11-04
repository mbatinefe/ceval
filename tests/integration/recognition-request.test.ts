import test from "node:test";
import assert from "node:assert/strict";
import { retryCapturedRequest } from "../../src/client/scanner/recognition-request.ts";

test("an idempotent replay polls pending work until its original result is ready", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1000 });
  const ids: string[] = [];
  let retries = 0;
  const pending = retryCapturedRequest(
    async (id) => {
      ids.push(id);
      if (ids.length < 3) throw { code: "analysis_pending", status: 409 };
      return "saved-original-result";
    },
    new AbortController().signal,
    () => {
      retries++;
      return null;
    },
  );
  await new Promise((r) => setImmediate(r));
  t.mock.timers.tick(5000);
  await new Promise((r) => setImmediate(r));
  t.mock.timers.tick(5000);
  assert.equal(await pending, "saved-original-result");
  assert.equal(new Set(ids).size, 1);
  assert.equal(retries, 0);
});

test("pending polling is bounded and cancellation remains effective", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1000 });
  const controller = new AbortController();
  let calls = 0;
  const pending = retryCapturedRequest(
    async () => {
      calls++;
      throw { code: "analysis_pending" };
    },
    controller.signal,
    () => null,
  );
  await new Promise((r) => setImmediate(r));
  controller.abort();
  await assert.rejects(pending);
  assert.equal(calls, 1);
});

test("an uncertain network failure retries the same captured payload and request identity", async () => {
  const frames = ["earlier-A", "earlier-B", "earlier-C"],
    calls: { frames: string[]; id: string }[] = [];
  const result = await retryCapturedRequest(
    async (id) => {
      calls.push({ frames: [...frames], id });
      if (calls.length === 1) throw new TypeError("network lost");
      return "complete";
    },
    new AbortController().signal,
    () => ({ at: Date.now() }),
  );
  assert.equal(result, "complete");
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], calls[1]);
});

test("a known terminal provider failure retries the captured batch after cooldown using the same identity", async () => {
  const ids: string[] = [];
  await retryCapturedRequest(
    async (id) => {
      ids.push(id);
      if (ids.length === 1) throw new Error("terminal");
    },
    new AbortController().signal,
    () => ({ at: Date.now() }),
  );
  assert.equal(ids.length, 2);
  assert.equal(ids[0], ids[1]);
});

test("cancelling during backoff cannot send a second request", async () => {
  const controller = new AbortController();
  let calls = 0;
  const pending = retryCapturedRequest(
    async () => {
      calls++;
      throw new Error("offline");
    },
    controller.signal,
    () => ({ at: Date.now() + 10000 }),
  );
  await new Promise((r) => setImmediate(r));
  controller.abort();
  await assert.rejects(pending);
  assert.equal(calls, 1);
});

test("a second failure is surfaced instead of retrying indefinitely", async () => {
  let calls = 0;
  await assert.rejects(
    retryCapturedRequest(
      async () => {
        calls++;
        throw new Error("failed");
      },
      new AbortController().signal,
      () => ({ at: Date.now() }),
    ),
  );
  assert.equal(calls, 2);
});
