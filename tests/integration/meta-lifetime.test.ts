import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { recognizeFrame } from "../../src/server/providers/meta.ts";

function pendingProvider(t: TestContext, client?: AbortSignal) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let signal!: AbortSignal;
  let release!: () => void;
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: string, init: RequestInit) => {
      signal = init.signal!;
      return new Promise<Response>((resolve, reject) => {
        release = () =>
          resolve(
            Response.json({
              status: "completed",
              usage: { input_tokens: 1, output_tokens: 1 },
              output: [
                {
                  type: "message",
                  content: [{ type: "output_text", text: '{"products":[]}' }],
                },
              ],
            }),
          );
        if (signal.aborted) reject(signal.reason);
        else
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
      });
    },
  );
  const pending = recognizeFrame(
    { META_API_KEY: "test-key" } as Env,
    "test-frame",
    "US",
    client,
  ).catch((error) => error);
  return { signal, pending, release };
}

test("an accepted provider call gets a bounded grace period after its client disconnects", async (t) => {
  const client = new AbortController();
  const request = pendingProvider(t, client.signal);
  try {
    client.abort();
    assert.equal(request.signal.aborted, false);
    t.mock.timers.tick(24999);
    assert.equal(request.signal.aborted, false);
    t.mock.timers.tick(1);
    assert.equal(request.signal.aborted, true);
    assert.equal((await request.pending).code, "analysis_timeout");
  } finally {
    request.release();
    await request.pending;
  }
});

test("disconnect grace cannot extend the original provider deadline", async (t) => {
  const client = new AbortController();
  const request = pendingProvider(t, client.signal);
  try {
    t.mock.timers.tick(30000);
    client.abort();
    assert.equal(request.signal.aborted, false);
    t.mock.timers.tick(15000);
    assert.equal(request.signal.aborted, true);
    assert.equal((await request.pending).code, "analysis_timeout");
  } finally {
    request.release();
    await request.pending;
  }
});

test("connected requests retain the normal provider timeout", async (t) => {
  const request = pendingProvider(t);
  try {
    t.mock.timers.tick(44999);
    assert.equal(request.signal.aborted, false);
    t.mock.timers.tick(1);
    assert.equal(request.signal.aborted, true);
    assert.equal((await request.pending).code, "analysis_timeout");
  } finally {
    request.release();
    await request.pending;
  }
});

test("finishing a response clears its timeout and disconnect listener", async (t) => {
  const client = new AbortController();
  const request = pendingProvider(t, client.signal);
  request.release();
  assert.deepEqual(await request.pending, []);
  client.abort();
  t.mock.timers.tick(60000);
  assert.equal(request.signal.aborted, false);
});
