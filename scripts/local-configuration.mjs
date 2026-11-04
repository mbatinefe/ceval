import { randomBytes } from "node:crypto";
import { open } from "node:fs/promises";
import { join } from "node:path";

export async function ensureLocalSecrets(directory) {
  let file;
  try {
    file = await open(join(directory, ".dev.vars.local"), "wx", 0o600);
  } catch (error) {
    if (error.code === "EEXIST") return;
    throw error;
  }
  try {
    await file.writeFile(
      "# Local credentials. Keep this file private.\n" +
        `BETTER_AUTH_SECRET="${randomBytes(32).toString("hex")}"\n` +
        '# Add your own Meta key to enable live analysis.\nMETA_API_KEY=""\n',
    );
  } finally {
    await file.close();
  }
}
