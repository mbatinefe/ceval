import { applyMigration } from "../helpers/migrations.ts";
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import * as budget from "../../src/server/scan/budget.ts";

const stateMigration = "0004_scan_spend_states.sql";
let mf: Miniflare;
let env: Env;
let legacyDb: D1Database;

async function migrate(db: D1Database, file: string) {
  await applyMigration(db, file);
}

type SpendRow = {
  id: string;
  user_id: string;
  scope: string;
  kind: string;
  amount: number;
  created_at: number;
  reserved_amount: number;
  status: "pending" | "estimated" | "unresolved";
  settled_at: number | null;
  job_id: string | null;
};

async function spend(id: string) {
  const row = await env.DB.prepare("SELECT * FROM scan_spend WHERE id=?")
    .bind(id)
    .first<SpendRow>();
  assert.ok(row);
  return row;
}

before(async () => {
  mf = new Miniflare(
    await convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("test")}}',
      compatibilityDate: "2026-10-29",
      d1Databases: ["DB", "LEGACY"],
    }),
  );
  const db = await mf.getD1Database("DB");
  legacyDb = await mf.getD1Database("LEGACY");
  for (const file of (await readdir("db/d1/migrations"))
    .filter((file) => file.endsWith(".sql") && file < stateMigration)
    .sort()) {
    await migrate(db, file);
    await migrate(legacyDb, file);
  }
  await migrate(db, stateMigration);
  await migrate(db, "0007_trial_access.sql");
  env = {
    DB: db,
    SCAN_TOTAL_BUDGET_MICROS: "100000000",
  } as unknown as Env;
});

after(async () => {
  await mf?.dispose();
});

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM scan_spend").run();
  env.SCAN_TOTAL_BUDGET_MICROS = "100000000";
});

test("the ledger migration preserves every historical amount and leaves ambiguous costs unresolved", async () => {
  const fixtures = [
    ["compare-hold", "compare", 2_000_000],
    ["recognition-estimate", "recognize", 550],
    ["recognition-ambiguous", "recognize", 50_000],
    ["compare-estimate", "compare", 3_050],
    ["unknown-kind", "legacy", 750],
    ["recognition-above-hold", "recognize", 60_000],
  ] as const;
  await legacyDb.batch(
    fixtures.map(([id, kind, amount], index) =>
      legacyDb
        .prepare(
          "INSERT INTO scan_spend (id,user_id,scope,kind,amount,created_at) VALUES (?,?,?,?,?,?)",
        )
        .bind(
          id,
          "former-shopper",
          index ? "total" : "legacy",
          kind,
          amount,
          1000 + index,
        ),
    ),
  );
  const original = await legacyDb
    .prepare(
      "SELECT id,user_id,scope,kind,amount,created_at FROM scan_spend ORDER BY id",
    )
    .all();

  await migrate(legacyDb, stateMigration);

  assert.deepEqual(
    (
      await legacyDb
        .prepare(
          "SELECT id,user_id,scope,kind,amount,created_at FROM scan_spend ORDER BY id",
        )
        .all()
    ).results,
    original.results,
  );
  assert.deepEqual(
    await legacyDb
      .prepare(
        "SELECT COUNT(*) AS count,SUM(amount) AS exposure FROM scan_spend",
      )
      .first(),
    { count: 6, exposure: 2_114_350 },
  );
  assert.deepEqual(
    (
      await legacyDb
        .prepare(
          "SELECT id,reserved_amount,status,settled_at,job_id FROM scan_spend ORDER BY id",
        )
        .all()
    ).results,
    [
      {
        id: "compare-estimate",
        reserved_amount: 2_000_000,
        status: "estimated",
        settled_at: null,
        job_id: null,
      },
      {
        id: "compare-hold",
        reserved_amount: 2_000_000,
        status: "unresolved",
        settled_at: null,
        job_id: null,
      },
      {
        id: "recognition-above-hold",
        reserved_amount: 50_000,
        status: "estimated",
        settled_at: null,
        job_id: null,
      },
      {
        id: "recognition-ambiguous",
        reserved_amount: 50_000,
        status: "unresolved",
        settled_at: null,
        job_id: null,
      },
      {
        id: "recognition-estimate",
        reserved_amount: 50_000,
        status: "estimated",
        settled_at: null,
        job_id: null,
      },
      {
        id: "unknown-kind",
        reserved_amount: 0,
        status: "unresolved",
        settled_at: null,
        job_id: null,
      },
    ],
  );
});

test("new reservations remain pending until provider usage is known", async () => {
  const recognize = await budget.reserveScan(
    env,
    "shopper",
    "recognize",
    "recognition-job",
  );
  const compare = await budget.reserveScan(env, "shopper", "compare");
  const row = await spend(recognize.id);
  assert.equal(row.amount, 50_000);
  assert.equal(row.reserved_amount, 50_000);
  assert.equal(row.status, "pending");
  assert.equal(row.settled_at, null);
  assert.equal(row.job_id, "recognition-job");
  assert.equal((await spend(compare.id)).job_id, null);
  assert.equal((await spend(compare.id)).reserved_amount, 2_000_000);
  assert.deepEqual(await budget.scanBudgetSummary(env), {
    estimatedUsageMicros: 0,
    pendingReservationMicros: 2_050_000,
    unresolvedReservationMicros: 0,
    exposureMicros: 2_050_000,
    limitMicros: 100_000_000,
  });
});

test("finishing without complete usage keeps the full unresolved hold", async () => {
  const reservation = await budget.reserveScan(
    env,
    "shopper",
    "compare",
    "failed-job",
  );
  const original = await spend(reservation.id);
  await budget.finishScanReservation(env, reservation);
  await budget.finishScanReservation(env, reservation);
  assert.deepEqual(await spend(reservation.id), {
    ...original,
    status: "unresolved",
  });
  assert.deepEqual(await budget.scanBudgetSummary(env), {
    estimatedUsageMicros: 0,
    pendingReservationMicros: 0,
    unresolvedReservationMicros: 2_000_000,
    exposureMicros: 2_000_000,
    limitMicros: 100_000_000,
  });
});

test("late complete usage can resolve an unknown cost without erasing the original reservation", async (t) => {
  const reservation = await budget.reserveScan(
    env,
    "shopper",
    "recognize",
    "late-job",
  );
  await budget.finishScanReservation(env, reservation);
  const settledAt = Date.now() + 1000;
  t.mock.method(Date, "now", () => settledAt);
  await budget.settleScan(env, reservation, 550);
  const row = await spend(reservation.id);
  assert.equal(row.status, "estimated");
  assert.equal(row.amount, 550);
  assert.equal(row.reserved_amount, 50_000);
  assert.equal(row.settled_at, settledAt);
  assert.equal(row.job_id, "late-job");
  assert.deepEqual(await budget.scanBudgetSummary(env), {
    estimatedUsageMicros: 550,
    pendingReservationMicros: 0,
    unresolvedReservationMicros: 0,
    exposureMicros: 550,
    limitMicros: 100_000_000,
  });
});

test("cleanup cannot turn an estimated cost back into an unresolved hold", async () => {
  const reservation = await budget.reserveScan(env, "shopper", "compare");
  await budget.settleScan(env, reservation, 3_050);
  const settled = await spend(reservation.id);
  assert.equal(settled.status, "estimated");
  await budget.finishScanReservation(env, reservation);
  assert.deepEqual(await spend(reservation.id), settled);
});

test("settlement is idempotent even when the usage estimate equals the reservation", async () => {
  const reservation = await budget.reserveScan(env, "shopper", "recognize");
  await budget.settleScan(env, reservation, 50_000);
  const settled = await spend(reservation.id);
  assert.equal(settled.status, "estimated");
  assert.ok(settled.settled_at);
  await budget.settleScan(env, reservation, 550);
  assert.deepEqual(await spend(reservation.id), settled);
});

test("invalid usage cannot release either a pending or unresolved reservation", async () => {
  const reservation = await budget.reserveScan(env, "shopper", "recognize");
  for (const finish of [false, true]) {
    if (finish) await budget.finishScanReservation(env, reservation);
    const original = await spend(reservation.id);
    for (const amount of [
      0,
      -1,
      0.5,
      NaN,
      Infinity,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      await budget.settleScan(env, reservation, amount);
      assert.deepEqual(await spend(reservation.id), original);
    }
  }
});

test("reported usage above the original hold remains counted in exposure", async () => {
  const reservation = await budget.reserveScan(env, "shopper", "recognize");
  await budget.settleScan(env, reservation, 60_000);
  const row = await spend(reservation.id);
  assert.equal(row.amount, 60_000);
  assert.equal(row.reserved_amount, 50_000);
  assert.equal(row.status, "estimated");
  assert.equal((await budget.scanBudgetSummary(env)).exposureMicros, 60_000);
});

test("only pending holds older than sixty seconds become unresolved on the next reservation", async (t) => {
  const now = Date.now();
  t.mock.method(Date, "now", () => now);
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO scan_spend (id,user_id,kind,amount,created_at,reserved_amount,status,settled_at) VALUES ('stale','shopper','recognize',50000,?,50000,'pending',NULL)",
    ).bind(now - 60_001),
    env.DB.prepare(
      "INSERT INTO scan_spend (id,user_id,kind,amount,created_at,reserved_amount,status,settled_at) VALUES ('boundary','shopper','recognize',50000,?,50000,'pending',NULL)",
    ).bind(now - 60_000),
    env.DB.prepare(
      "INSERT INTO scan_spend (id,user_id,kind,amount,created_at,reserved_amount,status,settled_at) VALUES ('fresh','shopper','compare',2000000,?,2000000,'pending',NULL)",
    ).bind(now - 59_999),
    env.DB.prepare(
      "INSERT INTO scan_spend (id,user_id,kind,amount,created_at,reserved_amount,status,settled_at) VALUES ('known','shopper','recognize',550,?,50000,'estimated',?)",
    ).bind(now - 120_000, now - 100_000),
    env.DB.prepare(
      "INSERT INTO scan_spend (id,user_id,kind,amount,created_at,reserved_amount,status,settled_at) VALUES ('unknown','shopper','compare',2000000,?,2000000,'unresolved',NULL)",
    ).bind(now - 120_000),
  ]);
  const stale = await spend("stale");
  const unchanged = await Promise.all(
    ["boundary", "fresh", "known", "unknown"].map(spend),
  );
  await budget.reserveScan(env, "shopper", "recognize");
  assert.deepEqual(await spend("stale"), { ...stale, status: "unresolved" });
  assert.deepEqual(
    await Promise.all(["boundary", "fresh", "known", "unknown"].map(spend)),
    unchanged,
  );
  assert.deepEqual(await budget.scanBudgetSummary(env), {
    estimatedUsageMicros: 550,
    pendingReservationMicros: 2_100_000,
    unresolvedReservationMicros: 2_050_000,
    exposureMicros: 4_150_550,
    limitMicros: 100_000_000,
  });
});

test("the summary includes historical and unknown-kind exposure across accounts and scopes", async () => {
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO scan_spend (id,user_id,scope,kind,amount,created_at,reserved_amount,status) VALUES ('estimated','former-shopper','legacy','recognize',550,1,50000,'estimated')",
    ),
    env.DB.prepare(
      "INSERT INTO scan_spend (id,user_id,kind,amount,created_at,reserved_amount,status) VALUES ('unknown','former-shopper','compare',2000000,1,2000000,'unresolved')",
    ),
    env.DB.prepare(
      "INSERT INTO scan_spend (id,user_id,scope,kind,amount,created_at) VALUES ('unknown-kind','former-shopper','legacy','legacy',750,1)",
    ),
    env.DB.prepare(
      "INSERT INTO scan_spend (id,user_id,kind,amount,created_at,reserved_amount,status) VALUES ('pending','shopper','compare',2000000,?,2000000,'pending')",
    ).bind(Date.now()),
  ]);
  assert.deepEqual(await budget.scanBudgetSummary(env), {
    estimatedUsageMicros: 550,
    pendingReservationMicros: 2_000_000,
    unresolvedReservationMicros: 2_000_750,
    exposureMicros: 4_001_300,
    limitMicros: 100_000_000,
  });
});
