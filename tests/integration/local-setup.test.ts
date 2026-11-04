import { test } from "node:test";
import assert from "node:assert/strict";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureLocalSecrets } from "../../scripts/local-configuration.mjs";

test("local setup creates a unique auth secret and preserves existing local credentials", async () => {
  const first = await mkdtemp(join(tmpdir(), "ceval-local-"));
  const second = await mkdtemp(join(tmpdir(), "ceval-local-"));
  try {
    await ensureLocalSecrets(first);
    await ensureLocalSecrets(second);
    const filename = join(first, ".dev.vars.local");
    const generated = await readFile(filename, "utf8");
    assert.match(generated, /BETTER_AUTH_SECRET="[a-f0-9]{64}"/);
    assert.match(generated, /META_API_KEY=""/);
    assert.doesNotMatch(generated, /RESEND|AUTH_EMAIL_FROM/);
    assert.notEqual(
      generated,
      await readFile(join(second, ".dev.vars.local"), "utf8"),
    );
    const existing =
      'BETTER_AUTH_SECRET="keep-this-secret"\nMETA_API_KEY="keep-this-key"\n';
    await writeFile(filename, existing);
    await ensureLocalSecrets(first);
    assert.equal(await readFile(filename, "utf8"), existing);
  } finally {
    await rm(first, { recursive: true, force: true });
    await rm(second, { recursive: true, force: true });
  }
});

test("cancelled migrations and builds stop setup without reporting readiness", async () => {
  for (const [stage, signal, forward] of [
    ["migration", "SIGTERM", false],
    ["build", "SIGINT", false],
    ["migration", "SIGINT", true],
    ["build", "SIGTERM", true],
  ] as const) {
    const directory = await mkdtemp(join(tmpdir(), "ceval-cancel-"));
    try {
      await mkdir(join(directory, "scripts"), { recursive: true });
      await mkdir(join(directory, "node_modules/wrangler/bin"), {
        recursive: true,
      });
      await mkdir(join(directory, "node_modules/vite/bin"), {
        recursive: true,
      });
      for (const file of ["local-dev.mjs", "local-configuration.mjs"])
        await copyFile(
          new URL(`../../scripts/${file}`, import.meta.url),
          join(directory, "scripts", file),
        );
      const interrupted = forward
        ? `process.on("${signal}", () => process.exit(0)); console.log("command waiting"); setInterval(() => {}, 1000);`
        : `process.kill(process.pid, "${signal}");`;
      await writeFile(
        join(directory, "node_modules/wrangler/bin/wrangler.js"),
        stage === "migration" ? interrupted : "",
      );
      await writeFile(
        join(directory, "node_modules/vite/bin/vite.js"),
        stage === "build" ? interrupted : 'console.log("later build started");',
      );
      const child = spawn(process.execPath, [
        join(directory, "scripts/local-dev.mjs"),
        "--setup-only",
      ]);
      let output = "";
      let sent = false;
      child.stdout.on("data", (chunk) => {
        output += chunk;
        if (forward && !sent && output.includes("command waiting")) {
          sent = true;
          child.kill(signal);
        }
      });
      child.stderr.on("data", (chunk) => {
        output += chunk;
      });
      const code = await new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", resolve);
      });
      assert.equal(code, signal === "SIGTERM" ? 143 : 130, output);
      assert.doesNotMatch(output, /Local setup ready|later build started/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
});
