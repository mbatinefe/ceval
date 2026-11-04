import { readFile } from "node:fs/promises";

export async function applyMigration(db: D1Database, file: string) {
  const sql = await readFile(`db/d1/migrations/${file}`, "utf8");
  // D1 exec separates lines; preserve trigger bodies as complete SQL statements.
  await db.exec(sql.replace(/--[^\n]*/g, "").replace(/\n/g, " "));
}
