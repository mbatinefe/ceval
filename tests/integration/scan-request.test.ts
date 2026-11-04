import { test } from "node:test";
import assert from "node:assert/strict";
import { scanRequest } from "../../src/client/scanner/media.ts";

test("scanner requests preserve error codes so budget denial does not look like a transient provider failure", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json(
      { error: "Daily limit reached", code: "daily_budget_exhausted" },
      { status: 429 },
    );
  try {
    await assert.rejects(
      scanRequest("/api/scan/compare", {}, new AbortController().signal),
      (error) => {
        assert.ok(error instanceof Error);
        assert.equal(
          (error as Error & { code?: string }).code,
          "daily_budget_exhausted",
        );
        assert.equal((error as Error & { status?: number }).status, 429);
        return true;
      },
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("HTML gateway failures preserve HTTP status for scanner recovery", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response("<!DOCTYPE html><h1>Worker exceeded resource limits</h1>", {
      status: 503,
      headers: { "Content-Type": "text/html" },
    });
  try {
    await assert.rejects(
      scanRequest("/api/scan/recognize", {}, new AbortController().signal),
      (error) => {
        assert.ok(error instanceof Error);
        assert.equal((error as Error & { status?: number }).status, 503);
        assert.equal(
          (error as Error & { code?: string }).code,
          "request_failed",
        );
        assert.doesNotMatch(error.message, /DOCTYPE|Unexpected token/);
        return true;
      },
    );
  } finally {
    globalThis.fetch = original;
  }
});
