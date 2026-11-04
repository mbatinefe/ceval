import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import {
  reserveScan,
  settleScan,
  finishScanReservation,
  scanBudgetSummary,
} from "../../src/server/scan/budget.ts";
import { runScanRequest } from "../../src/server/scan/processor.ts";
import { digest } from "../../src/server/scan/service.ts";
import { applyMigration } from "../helpers/migrations.ts";
import { setTimeout as delay } from "node:timers/promises";

let mf: Miniflare;
let db: D1Database;
let env: Env;

before(async () => {
  mf = new Miniflare(
    await convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("test")}}',
      compatibilityDate: "2026-10-29",
      d1Databases: ["DB"],
    }),
  );
  db = await mf.getD1Database("DB");
  env = {
    DB: db,
    SCAN_TOTAL_BUDGET_MICROS: "100000000",
    SCAN_ENABLED: "true",
    META_API_KEY: "test-only",
  } as unknown as Env;
  for (const file of (await readdir("db/d1/migrations"))
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    await applyMigration(db, file);
  }
});
after(async () => {
  await mf?.dispose();
});
beforeEach(async () => {
  await db.batch([
    db.prepare("UPDATE signup_trial_policy SET enabled=0 WHERE id=1"),
    db.prepare("DELETE FROM user"),
    db.prepare("DELETE FROM signup_trial_enrollments"),
    db.prepare("DELETE FROM scan_spend"),
  ]);
});
const insert = (id: string, verified = 1) =>
  db
    .prepare(
      "INSERT INTO user (id,name,email,emailVerified,createdAt,updatedAt) VALUES (?, ?, ?, ?, 1, 1)",
    )
    .bind(id, "Test shopper", `${id}@example.com`, verified)
    .run();
const activate = () =>
  db.prepare("UPDATE signup_trial_policy SET enabled=1 WHERE id=1").run();
const enrollment = (id: string) =>
  db
    .prepare("SELECT started_at FROM signup_trial_enrollments WHERE user_id=?")
    .bind(id)
    .first<{ started_at: number | null }>();
async function capabilities(id: string) {
  const response = await runScanRequest(
    env,
    id,
    new Request("https://ceval.example/api/scan/capabilities"),
    { waitUntil() {} },
  );
  assert.equal(response.status, 200);
  return response.json();
}

test("trial enrollment is disabled until explicitly activated", async () => {
  const policy = await db
    .prepare("SELECT enabled FROM signup_trial_policy WHERE id=1")
    .first();
  assert.deepEqual(policy, { enabled: 0 });
  await insert("legacy");
  await activate();
  assert.equal(await enrollment("legacy"), null);
  assert.equal((await capabilities("legacy")).trial, false);
  await reserveScan(env, "legacy", "recognize");
});

test("concurrent database signups atomically admit exactly three verified accounts", async () => {
  await activate();
  const results = await Promise.allSettled(
    Array.from({ length: 10 }, (_, i) => insert(`racer-${i}`)),
  );
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    3,
  );
  assert.deepEqual(await db.prepare("SELECT COUNT(*) AS n FROM user").first(), {
    n: 3,
  });
  assert.deepEqual(
    await db
      .prepare("SELECT COUNT(*) AS n FROM signup_trial_enrollments")
      .first(),
    { n: 3 },
  );
});

test("deleting an account cannot free a slot or reset that email's trial", async () => {
  await activate();
  await insert("first");
  await db.prepare("DELETE FROM user WHERE id='first'").run();
  await assert.rejects(insert("first"));
  await assert.rejects(
    db
      .prepare(
        "INSERT INTO user (id,name,email,emailVerified,createdAt,updatedAt) VALUES ('fresh-id','Shopper','FIRST@example.com',1,1,1)",
      )
      .run(),
  );
  await insert("second");
  await insert("third");
  await db.prepare("DELETE FROM user").run();
  await assert.rejects(insert("fourth"));
  assert.deepEqual(
    await db
      .prepare("SELECT COUNT(*) AS n FROM signup_trial_enrollments")
      .first(),
    { n: 3 },
  );
});

test("an unverified user insert cannot bypass enrollment", async () => {
  await activate();
  await assert.rejects(insert("unverified", 0));
  assert.deepEqual(
    await db
      .prepare("SELECT COUNT(*) AS n FROM signup_trial_enrollments")
      .first(),
    { n: 0 },
  );
});

test("a reservation delayed past expiry uses the database clock and preserves unresolved exposure", async (t) => {
  await activate();
  await insert("trial");
  const { now } = (await db
    .prepare("SELECT CAST(unixepoch('subsec')*1000 AS INTEGER) AS now")
    .first<{ now: number }>())!;
  await db
    .prepare(
      "UPDATE signup_trial_enrollments SET started_at=? WHERE user_id='trial'",
    )
    .bind(now - 599_950)
    .run();
  await db
    .prepare(
      "INSERT INTO scan_spend (id,user_id,kind,amount,reserved_amount,status,created_at) VALUES ('unresolved','legacy','compare',2000000,2000000,'unresolved',1)",
    )
    .run();
  t.mock.method(Date, "now", () => now);
  env.DB = new Proxy(db, {
    get(target, key) {
      if (key === "prepare")
        return (sql: string) => {
          const statement = db.prepare(sql);
          if (
            !sql.startsWith(
              "UPDATE scan_spend SET status='unresolved' WHERE status='pending'",
            )
          )
            return statement;
          return new Proxy(statement, {
            get(prepared, method) {
              if (method === "bind")
                return (...values: unknown[]) => {
                  const bound = prepared.bind(...values);
                  return new Proxy(bound, {
                    get(result, operation) {
                      if (operation === "run")
                        return async () => {
                          const updated = await result.run();
                          await delay(100);
                          return updated;
                        };
                      const value = Reflect.get(result, operation);
                      return typeof value === "function"
                        ? value.bind(result)
                        : value;
                    },
                  });
                };
              const value = Reflect.get(prepared, method);
              return typeof value === "function" ? value.bind(prepared) : value;
            },
          });
        };
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  t.after(() => {
    env.DB = db;
  });
  await assert.rejects(
    reserveScan(env, "trial", "recognize"),
    (error: any) => error.code === "trial_expired",
  );
  assert.equal((await scanBudgetSummary(env)).exposureMicros, 2_000_000);
  assert.deepEqual(
    await db.prepare("SELECT COUNT(*) AS n FROM scan_spend").first(),
    { n: 1 },
  );
});

test("signup and capability reads leave all ten minutes available until the first paid reservation", async (t) => {
  await activate();
  await insert("trial");
  const now = Date.now();
  t.mock.method(Date, "now", () => now);
  const state = await capabilities("trial");
  assert.equal(state.trial, true);
  assert.deepEqual(state.trialAccess, {
    durationSeconds: 600,
    startedAt: null,
    expiresAt: null,
    remainingSeconds: 600,
    serverNow: now,
  });
  assert.deepEqual(await enrollment("trial"), { started_at: null });
  await Promise.all([
    reserveScan(env, "trial", "recognize"),
    reserveScan(env, "trial", "compare"),
  ]);
  const startedAt = (await enrollment("trial"))!.started_at!;
  assert.ok(startedAt >= now);
  assert.deepEqual(
    await db
      .prepare("SELECT MIN(created_at) AS started_at FROM scan_spend")
      .first(),
    { started_at: startedAt },
  );
  t.mock.method(Date, "now", () => startedAt);
  assert.deepEqual((await capabilities("trial")).trialAccess, {
    durationSeconds: 600,
    startedAt,
    expiresAt: startedAt + 600_000,
    remainingSeconds: 600,
    serverNow: startedAt,
  });
});

test("the continuous window blocks every new paid reservation at the exact expiry boundary", async (t) => {
  await activate();
  await insert("trial");
  await reserveScan(env, "trial", "recognize");
  await db
    .prepare(
      "UPDATE signup_trial_enrollments SET started_at=CAST(unixepoch('subsec')*1000 AS INTEGER)-590000 WHERE user_id='trial'",
    )
    .run();
  await reserveScan(env, "trial", "compare", "visual:ranking");
  let now = (await enrollment("trial"))!.started_at! + 599_999;
  t.mock.method(Date, "now", () => now);
  assert.equal((await capabilities("trial")).trialAccess.remainingSeconds, 1);
  now += 1;
  assert.equal((await capabilities("trial")).trialAccess.remainingSeconds, 0);
  await db
    .prepare(
      "UPDATE signup_trial_enrollments SET started_at=CAST(unixepoch('subsec')*1000 AS INTEGER)-600000 WHERE user_id='trial'",
    )
    .run();
  for (const kind of ["recognize", "compare"] as const) {
    await assert.rejects(
      reserveScan(env, "trial", kind),
      (error: any) => error.code === "trial_expired" && error.status === 429,
    );
  }
  const state = await capabilities("trial");
  assert.equal(state.analysisAvailable, false);
  assert.equal(state.visualSearchAvailable, false);
  assert.equal(state.trialAccess.remainingSeconds, 0);
  assert.deepEqual(
    await db.prepare("SELECT COUNT(*) AS n FROM scan_spend").first(),
    { n: 2 },
  );
});

test("in-flight usage settles after expiry while unresolved holds remain in the deployment ledger", async () => {
  await activate();
  await insert("trial");
  const reservation = await reserveScan(env, "trial", "recognize");
  const unresolved = await reserveScan(env, "trial", "compare");
  await db
    .prepare(
      "UPDATE signup_trial_enrollments SET started_at=CAST(unixepoch('subsec')*1000 AS INTEGER)-600001 WHERE user_id='trial'",
    )
    .run();
  await finishScanReservation(env, unresolved);
  await settleScan(env, reservation, 550);
  assert.deepEqual(await scanBudgetSummary(env), {
    estimatedUsageMicros: 550,
    pendingReservationMicros: 0,
    unresolvedReservationMicros: 2_000_000,
    exposureMicros: 2_000_550,
    limitMicros: 100_000_000,
  });
  await db.prepare("DELETE FROM user").run();
  assert.equal((await scanBudgetSummary(env)).exposureMicros, 2_000_550);
});

test("trial users cannot bypass the deployment budget and a rejected reservation does not start their window", async () => {
  await activate();
  await insert("trial");
  await db
    .prepare(
      "INSERT INTO scan_spend (id,user_id,kind,amount,reserved_amount,status,created_at) VALUES ('historical','legacy','compare',100000000,100000000,'unresolved',1)",
    )
    .run();
  await assert.rejects(
    reserveScan(env, "trial", "recognize"),
    (error: any) => error.code === "total_budget_exhausted",
  );
  assert.deepEqual(await enrollment("trial"), { started_at: null });
  assert.equal((await scanBudgetSummary(env)).exposureMicros, 100_000_000);
});

test("expired HTTP requests ignore supplied trial state, allow cached reads, and never invoke a paid provider", async (t) => {
  await activate();
  await insert("trial");
  const now = Date.now();
  t.mock.method(Date, "now", () => now);
  await db
    .prepare(
      "UPDATE signup_trial_enrollments SET started_at=? WHERE user_id='trial'",
    )
    .bind(now - 600_000)
    .run();
  const frame =
    "data:image/jpeg;base64," +
    (await readFile("tests/fixtures/frame.jpg")).toString("base64");
  const cached = { products: [], analyzedAt: now - 1 };
  await db
    .prepare(
      "INSERT INTO scan_jobs (id,user_id,kind,request_key,status,result,expires_at,created_at) VALUES ('cached','trial','recognize',?,'done',?,?,?)",
    )
    .bind(
      await digest(JSON.stringify(["visual-snapshots-v5", "US", frame, []])),
      JSON.stringify(cached),
      now + 60_000,
      now - 1,
    )
    .run();
  const outbound = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Unexpected paid provider call");
  });
  async function recognize(image: string) {
    return runScanRequest(
      env,
      "trial",
      new Request("https://ceval.example/api/scan/recognize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frame: image,
          market: "US",
          requestId: crypto.randomUUID(),
          trial: false,
          trialAccess: { startedAt: null, expiresAt: now + 600_000 },
        }),
      }),
      { waitUntil() {} },
    );
  }
  const reused = await recognize(frame);
  assert.equal(reused.status, 200);
  assert.deepEqual(await reused.json(), cached);
  const bytes = Buffer.from(frame.split(",")[1], "base64");
  const altered =
    "data:image/jpeg;base64," +
    Buffer.concat([
      bytes.subarray(0, 2),
      Buffer.from([255, 254, 0, 3, 65]),
      bytes.subarray(2),
    ]).toString("base64");
  const blocked = await recognize(altered);
  assert.equal(blocked.status, 429);
  assert.equal((await blocked.json()).code, "trial_expired");
  assert.equal(outbound.mock.callCount(), 0);
  assert.deepEqual(await enrollment("trial"), { started_at: now - 600_000 });
  assert.deepEqual(
    await db.prepare("SELECT COUNT(*) AS n FROM scan_spend").first(),
    { n: 0 },
  );
  const reads = await runScanRequest(
    env,
    "trial",
    new Request("https://ceval.example/api/comparisons"),
    { waitUntil() {} },
  );
  assert.equal(reads.status, 200);
  assert.deepEqual(await reads.json(), { comparisons: [] });
});
