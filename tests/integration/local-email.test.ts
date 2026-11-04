import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { sendLoginCode } from "../../src/server/auth/email.ts";

test("explicit loopback local configuration delivers a console code without email or network", async () => {
  const output: unknown[][] = [];
  const log = mock.method(console, "log", (...values: unknown[]) =>
    output.push(values),
  );
  const network = mock.method(globalThis, "fetch", async () => {
    throw new Error("Network must remain unused");
  });
  try {
    await sendLoginCode(
      {
        APP_ENVIRONMENT: "local",
        BETTER_AUTH_URL: "http://localhost:8787",
      } as Env,
      "private@example.com",
      "123456",
    );
    assert.deepEqual(output, [["Ceval local sign-in code: 123456"]]);
    assert.equal(network.mock.callCount(), 0);
  } finally {
    log.mock.restore();
    network.mock.restore();
  }
});

test("console code delivery stays closed outside a validated local origin", async () => {
  const output: unknown[][] = [];
  const log = mock.method(console, "log", (...values: unknown[]) =>
    output.push(values),
  );
  try {
    for (const [environment, url] of [
      ["production", "http://localhost:8787"],
      ["staging", "http://localhost:8787"],
      ["", "http://localhost:8787"],
      ["local", "https://example.com"],
      ["local", "http://localhost.example.com"],
      ["local", "http://localhost@evil.example"],
      ["local", "http://user:pass@localhost:8787"],
      ["local", "http://localhost:8787/path"],
      ["local", "file://localhost"],
      ["local", "invalid"],
    ]) {
      await assert.rejects(
        sendLoginCode(
          { APP_ENVIRONMENT: environment, BETTER_AUTH_URL: url } as Env,
          "private@example.com",
          "123456",
        ),
        /Email unavailable/,
      );
    }
    assert.deepEqual(output, []);
  } finally {
    log.mock.restore();
  }
});
