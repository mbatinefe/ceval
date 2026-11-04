import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ensureLocalSecrets } from "./local-configuration.mjs";

const directory = fileURLToPath(new URL("../", import.meta.url));
const configArgs = ["--config", "wrangler.local.jsonc", "--env", "local"];
const storageArgs = ["--local", "--persist-to", ".wrangler/local-state"];
const wrangler = "node_modules/wrangler/bin/wrangler.js";

class CommandCancelled extends Error {
  constructor(signal) {
    super(`Local command cancelled (${signal}).`);
    this.exitCode = signal === "SIGINT" ? 130 : 143;
  }
}

async function run(script, args, interactive = true) {
  const child = spawn(process.execPath, [script, ...args], {
    cwd: directory,
    stdio: [interactive ? "inherit" : "ignore", "inherit", "inherit"],
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  });
  let cancelledBy;
  const forward = (signal) => {
    cancelledBy = signal;
    child.kill(signal);
  };
  const interrupt = () => forward("SIGINT");
  const terminate = () => forward("SIGTERM");
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", terminate);
  try {
    await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        const cancellation = cancelledBy ?? signal;
        if (cancellation === "SIGINT" || cancellation === "SIGTERM")
          reject(new CommandCancelled(cancellation));
        else if (code === 0) resolve();
        else reject(new Error(`Local command failed (${code ?? signal})`));
      });
    });
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", terminate);
  }
}

try {
  await ensureLocalSecrets(directory);
  await run(
    wrangler,
    ["d1", "migrations", "apply", "DB", ...configArgs, ...storageArgs],
    false,
  );
  await run("node_modules/vite/bin/vite.js", ["build"], false);
  if (process.argv.includes("--setup-only")) {
    console.log(
      "Local setup ready. Run npm run dev and open http://localhost:8787.",
    );
  } else {
    await run(wrangler, [
      "dev",
      ...configArgs,
      ...storageArgs,
      "--ip",
      "127.0.0.1",
      "--port",
      "8787",
    ]);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = error instanceof CommandCancelled ? error.exitCode : 1;
}
