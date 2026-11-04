import { signupsEnabled } from "./config.ts";
import { ScanError } from "../scan/errors.ts";

const DURATION_SECONDS = 600;

export async function effectiveSignupsEnabled(env: Env): Promise<boolean> {
  if (!signupsEnabled(env)) return false;
  return (await signupStatus(env)).signupsEnabled;
}

export async function signupStatus(env: Env) {
  const policy = await env.DB.prepare(
    `SELECT enabled, (SELECT COUNT(*) FROM signup_trial_enrollments) AS enrolled
     FROM signup_trial_policy WHERE id=1`,
  ).first<{ enabled: number; enrolled: number }>();
  return {
    signupsEnabled: Boolean(
      signupsEnabled(env) && policy && (!policy.enabled || policy.enrolled < 3),
    ),
    ...(policy?.enabled
      ? {
          trialSignup: {
            limit: 3,
            remainingSlots: Math.max(0, 3 - policy.enrolled),
            durationSeconds: DURATION_SECONDS,
          },
        }
      : {}),
  };
}

export async function mayAuthenticateEmail(env: Env, email: string) {
  const existing = await env.DB.prepare("SELECT id FROM user WHERE email=?")
    .bind(email)
    .first();
  if (existing) return true;
  if (!(await effectiveSignupsEnabled(env))) return false;
  // A deleted account's address cannot receive another trial or consume a slot.
  const prior = await env.DB.prepare(
    "SELECT user_id FROM signup_trial_enrollments WHERE email=?",
  )
    .bind(email)
    .first();
  return !prior;
}

export async function trialAccess(env: Env, userId: string) {
  const row = await env.DB.prepare(
    "SELECT started_at FROM signup_trial_enrollments WHERE user_id=?",
  )
    .bind(userId)
    .first<{ started_at: number | null }>();
  if (!row) return { trial: false as const };
  const serverNow = Date.now();
  const expiresAt =
    row.started_at === null ? null : row.started_at + DURATION_SECONDS * 1000;
  return {
    trial: true as const,
    trialAccess: {
      durationSeconds: DURATION_SECONDS,
      startedAt: row.started_at,
      expiresAt,
      remainingSeconds:
        expiresAt === null
          ? DURATION_SECONDS
          : Math.max(0, Math.ceil((expiresAt - serverNow) / 1000)),
      serverNow,
    },
  };
}

export function expiredTrialError() {
  return new ScanError(
    "trial_expired",
    "Your ten-minute AI scanning trial has ended. Your saved results are still available.",
    429,
  );
}
