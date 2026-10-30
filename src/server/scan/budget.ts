import { ScanError } from "./errors.ts";
export async function reserveScan(
  env: Env,
  userId: string,
  kind: "recognize" | "compare",
) {
  const now = Date.now(),
    start = now - 86400000;
  const amount = kind === "recognize" ? 50000 : 2000000;
  const daily = Number(env.SCAN_DAILY_BUDGET_MICROS),
    total = Number(env.SCAN_TOTAL_BUDGET_MICROS);
  if (
    !Number.isSafeInteger(daily) ||
    daily <= 0 ||
    daily > 10_000_000 ||
    !Number.isSafeInteger(total) ||
    total <= 0 ||
    total > 100_000_000
  )
    throw new ScanError(
      "analysis_disabled",
      "Analysis is not enabled yet.",
      503,
    );
  // A single conditional write makes the lifetime, daily and account reservation atomic.
  const row = await env.DB.prepare(
    `INSERT INTO scan_spend (id,user_id,kind,amount,created_at)
    SELECT ?,?,?,?,? WHERE
    (SELECT COALESCE(SUM(amount),0) FROM scan_spend)+?<=? AND
    (SELECT COALESCE(SUM(amount),0) FROM scan_spend WHERE created_at>=?)+?<=? AND
    (SELECT COUNT(*) FROM scan_spend WHERE user_id=? AND kind=? AND created_at>=?)<?
    RETURNING id`,
  )
    .bind(
      crypto.randomUUID(),
      userId,
      kind,
      amount,
      now,
      amount,
      total,
      start,
      amount,
      daily,
      userId,
      kind,
      start,
      kind === "recognize" ? 30 : 10,
    )
    .first<{ id: string }>();
  if (!row)
    throw new ScanError(
      "allowance_exhausted",
      "The analysis allowance is used up. Existing results are still available.",
      429,
    );
  return { id: row.id, reserved: amount };
}
export async function settleScan(
  env: Env,
  reservation: { id: string; reserved: number },
  micros: number,
) {
  if (!Number.isSafeInteger(micros) || micros <= 0) return;
  await env.DB.prepare("UPDATE scan_spend SET amount=? WHERE id=? AND amount=?")
    .bind(micros, reservation.id, reservation.reserved)
    .run();
}
