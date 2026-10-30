import test from "node:test";
import assert from "node:assert/strict";
import { HistoryWriter } from "../../src/client/scanner/history-writer.ts";
const item = {
  id: "row",
  productId: "original",
  source: "camera" as const,
  mode: "resale" as const,
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
test("history serializes model changes and coalesces identical updates", async () => {
  const requests: string[] = [];
  const releases: (() => void)[] = [];
  const writer = new HistoryWriter(async (data) => {
    requests.push(data.productId);
    await new Promise<void>((resolve) => releases.push(resolve));
    return { id: data.id };
  });
  writer.enqueue(item);
  writer.enqueue(item);
  writer.enqueue({ ...item, productId: "selected" });
  assert.deepEqual(requests, ["original"]);
  releases.shift()!();
  await tick();
  assert.deepEqual(requests, ["original", "selected"]);
  releases.shift()!();
  await tick();
  writer.enqueue({ ...item, productId: "selected" });
  assert.equal(requests.length, 2);
});
test("failed history writes wait for explicit retry instead of flooding API", async () => {
  let calls = 0;
  const writer = new HistoryWriter(async () => {
    calls++;
    if (calls === 1) throw Error("offline");
    return { id: "row" };
  });
  writer.enqueue(item);
  await tick();
  writer.enqueue(item);
  await tick();
  assert.equal(calls, 1);
  assert.equal(writer.state.failed, 1);
  writer.retry();
  await tick();
  assert.equal(calls, 2);
  assert.equal(writer.state.failed, 0);
});
test("disposing cancels queued account writes", async () => {
  let calls = 0,
    release: () => void = () => {};
  const writer = new HistoryWriter(async (data) => {
    calls++;
    await new Promise<void>((resolve) => (release = resolve));
    return { id: data.id };
  });
  writer.enqueue(item);
  writer.enqueue({ ...item, id: "next" });
  writer.dispose();
  release();
  await tick();
  assert.equal(calls, 1);
});
test("a returning product's canonical history id survives a queued model correction", async () => {
  const sent: { id: string; productId: string }[] = [];
  let release: () => void = () => {};
  const writer = new HistoryWriter(async (data) => {
    sent.push({ id: data.id, productId: data.productId });
    if (sent.length === 1)
      await new Promise<void>((resolve) => (release = resolve));
    return { id: "existing-history" };
  });
  writer.enqueue(item);
  writer.enqueue({ ...item, productId: "selected" });
  release();
  await tick();
  assert.deepEqual(sent, [
    { id: "row", productId: "original" },
    { id: "existing-history", productId: "selected" },
  ]);
});
