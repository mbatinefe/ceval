import { ScanError } from "./errors.ts";
// Allow repeated store walkthroughs while keeping both spend caps independent.
const ACCOUNT_DAILY_REQUESTS = { recognize: 120, compare: 30 } as const;
export async function reserveScan(
  env: Env,
  userId: string,
  kind: "recognize" | "compare",
) {
  const now = Date.now(),
    start = now - 86400000;
  const amount = kind === "recognize" ? 50000 : 2000000;
  // Starting a price search must leave room for the next frame reservation.
  const required = amount + (kind === "compare" ? 50000 : 0);
  const daily = Number(env.SCAN_DAILY_BUDGET_MICROS),
    total = Number(env.SCAN_TOTAL_BUDGET_MICROS);
  if (
    !Number.isSafeInteger(daily) ||
    daily <= 0 ||
    daily > 15_000_000 ||
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
      required,
      total,
      start,
      required,
      daily,
      userId,
      kind,
      start,
      ACCOUNT_DAILY_REQUESTS[kind],
    )
    .first<{ id: string }>();
  if (!row) {
    const usage = await env.DB.prepare(
      `SELECT COALESCE(SUM(amount),0) AS total,
      COALESCE(SUM(CASE WHEN created_at>=? THEN amount ELSE 0 END),0) AS daily,
      COUNT(CASE WHEN user_id=? AND kind=? AND created_at>=? THEN 1 END) AS requests
      FROM scan_spend`,
    )
      .bind(start, userId, kind, start)
      .first<{ total: number; daily: number; requests: number }>();
    if (usage && usage.total + required > total)
      throw new ScanError(
        "total_budget_exhausted",
        "Analysis is paused because the service allowance is used up. Existing results are still available.",
        429,
      );
    if (usage && usage.daily + required > daily)
      throw new ScanError(
        "daily_budget_exhausted",
        "Today's analysis budget is in use. Try again later; existing results are still available.",
        429,
      );
    if (usage && usage.requests >= ACCOUNT_DAILY_REQUESTS[kind])
      throw new ScanError(
        "account_allowance_exhausted",
        kind === "recognize"
          ? "Your daily frame analysis allowance is used up. You can still review products already found."
          : "Your daily price-search allowance is used up. Existing comparisons are still available.",
        429,
      );
    throw new ScanError(
      "allowance_exhausted",
      "The analysis allowance is used up. Existing results are still available.",
      429,
    );
  }
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
