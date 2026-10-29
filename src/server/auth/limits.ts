export class LimitReached extends Error {
  retryAfter: number;
  constructor(retryAfter: number) {
    super("Please wait before trying again.");
    this.retryAfter = retryAfter;
  }
}
export async function privateKey(
  secret: string,
  value: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const hash = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
export async function consumeLimit(
  db: D1Database,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const row = await db
    .prepare(
      `
    INSERT INTO app_limits (key, count, resets_at) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN resets_at <= ? THEN 1 ELSE count + 1 END,
      resets_at = CASE WHEN resets_at <= ? THEN excluded.resets_at ELSE resets_at END
    WHERE resets_at <= ? OR count < ? RETURNING count
  `,
    )
    .bind(key, now + windowSeconds, now, now, now, limit)
    .first<{ count: number }>();
  if (!row) {
    const state = await db
      .prepare("SELECT resets_at FROM app_limits WHERE key = ?")
      .bind(key)
      .first<{ resets_at: number }>();
    throw new LimitReached(
      Math.max(1, (state?.resets_at ?? now + windowSeconds) - now),
    );
  }
}
export async function reserveEmail(
  env: Env,
  email: string,
  ip: string,
): Promise<void> {
  const [emailKey, ipKey] = await Promise.all([
    privateKey(env.BETTER_AUTH_SECRET, email),
    privateKey(env.BETTER_AUTH_SECRET, ip),
  ]);
  await consumeLimit(env.DB, `send:ip:${ipKey}`, 10, 3600);
  await consumeLimit(env.DB, `send:email:minute:${emailKey}`, 1, 60);
  await consumeLimit(env.DB, `send:email:hour:${emailKey}`, 5, 3600);
  // Reserve before delivery; uncertain provider outcomes never release the allowance.
  const configured = Number(env.EMAIL_DAILY_LIMIT);
  const daily =
    Number.isInteger(configured) && configured > 0 && configured <= 80
      ? configured
      : 80;
  await consumeLimit(env.DB, "send:deployment:day", daily, 86400);
}
