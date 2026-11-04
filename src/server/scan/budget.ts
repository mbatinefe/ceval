import { ScanError } from "./errors.ts";
import { expiredTrialError } from "../auth/trial.ts";

type Reservation = { id: string; reserved: number };
const PENDING_LIFETIME_MS = 60000;

function budgetLimit(env: Env) {
  const total = Number(env.SCAN_TOTAL_BUDGET_MICROS);
  if (!Number.isSafeInteger(total) || total <= 0 || total > 100_000_000)
    throw new ScanError(
      "analysis_disabled",
      "Analysis is not enabled yet.",
      503,
    );
  return total;
}

export async function reserveScan(
  env: Env,
  userId: string,
  kind: "recognize" | "compare",
  jobId?: string,
): Promise<Reservation> {
  const total = budgetLimit(env);
  const now = Date.now();
  const amount = kind === "recognize" ? 50000 : 2000000;
  // Leave room for the next frame while a price search is running.
  const required = amount + (kind === "compare" ? 50000 : 0);
  await env.DB.prepare(
    "UPDATE scan_spend SET status='unresolved' WHERE status='pending' AND created_at<?",
  )
    .bind(now - PENDING_LIFETIME_MS)
    .run();
  // One conditional write protects the total across users and concurrent requests.
  // Amounts without terminal usage remain exposure, never confirmed provider charges.
  const row = await env.DB.prepare(
    `WITH reservation_time AS (
      SELECT CAST(unixepoch('subsec')*1000 AS INTEGER) AS now
    )
    INSERT INTO scan_spend (id,user_id,kind,amount,reserved_amount,status,job_id,created_at)
    SELECT ?,?,?,?,?,'pending',?,reservation_time.now FROM reservation_time WHERE
    (SELECT COALESCE(SUM(amount),0) FROM scan_spend)+?<=?
    AND NOT EXISTS (
      SELECT 1 FROM signup_trial_enrollments
      WHERE user_id=? AND started_at IS NOT NULL AND started_at+600000<=reservation_time.now
    )
    RETURNING id`,
  )
    .bind(
      crypto.randomUUID(),
      userId,
      kind,
      amount,
      amount,
      jobId ?? null,
      required,
      total,
      userId,
    )
    .first<{ id: string }>();
  if (!row) {
    const expired = await env.DB.prepare(
      `SELECT 1 FROM signup_trial_enrollments WHERE user_id=?
       AND started_at IS NOT NULL AND started_at+600000<=CAST(unixepoch('subsec')*1000 AS INTEGER)`,
    )
      .bind(userId)
      .first();
    if (expired) throw expiredTrialError();
    throw new ScanError(
      "total_budget_exhausted",
      "Analysis is paused because its total budget is used or reserved. Existing results are still available.",
      429,
    );
  }
  return { id: row.id, reserved: amount };
}

export async function settleScan(
  env: Env,
  reservation: Reservation,
  micros: number,
) {
  if (!Number.isSafeInteger(micros) || micros <= 0) return;
  await env.DB.prepare(
    "UPDATE scan_spend SET amount=?,status='estimated',settled_at=? WHERE id=? AND reserved_amount=? AND status IN ('pending','unresolved')",
  )
    .bind(micros, Date.now(), reservation.id, reservation.reserved)
    .run();
}

export async function finishScanReservation(
  env: Env,
  reservation: Reservation,
) {
  await env.DB.prepare(
    "UPDATE scan_spend SET status='unresolved' WHERE id=? AND status='pending'",
  )
    .bind(reservation.id)
    .run();
}

export async function scanBudgetSummary(env: Env) {
  const cutoff = Date.now() - PENDING_LIFETIME_MS;
  const values = await env.DB.prepare(
    `SELECT
    COALESCE(SUM(CASE WHEN status='estimated' THEN amount ELSE 0 END),0) AS estimatedUsageMicros,
    COALESCE(SUM(CASE WHEN status='pending' AND created_at>=? THEN amount ELSE 0 END),0) AS pendingReservationMicros,
    COALESCE(SUM(CASE WHEN status='unresolved' OR (status='pending' AND created_at<?) THEN amount ELSE 0 END),0) AS unresolvedReservationMicros,
    COALESCE(SUM(amount),0) AS exposureMicros FROM scan_spend`,
  )
    .bind(cutoff, cutoff)
    .first<{
      estimatedUsageMicros: number;
      pendingReservationMicros: number;
      unresolvedReservationMicros: number;
      exposureMicros: number;
    }>();
  return {
    estimatedUsageMicros: values?.estimatedUsageMicros ?? 0,
    pendingReservationMicros: values?.pendingReservationMicros ?? 0,
    unresolvedReservationMicros: values?.unresolvedReservationMicros ?? 0,
    exposureMicros: values?.exposureMicros ?? 0,
    limitMicros: budgetLimit(env),
  };
}
