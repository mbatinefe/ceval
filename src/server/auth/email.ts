import { isLocalEnvironment } from "./local-env.ts";

// The logo as table cells, so it shows even when mail apps block images:
// two ink corners around a red square, then the wordmark.
const MARK_SIZES = [4, 5, 10, 5, 4];
const MARK_ROWS = ["##...", "#....", "..*..", "....#", "...##"];
const MARK_FILL: Record<string, string> = { "#": "#131313", "*": "#c4161c" };
const MARK = MARK_ROWS.map(
  (row, y) =>
    `<tr>${[...row]
      .map(
        (cell, x) =>
          `<td style="width:${MARK_SIZES[x]}px;height:${MARK_SIZES[y]}px;padding:0;font-size:0;line-height:0${MARK_FILL[cell] ? `;background:${MARK_FILL[cell]}` : ""}"></td>`,
      )
      .join("")}</tr>`,
).join("");
const LOGO = `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr><td style="padding:0;vertical-align:middle"><table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${MARK}</table></td><td style="padding:0 0 0 10px;vertical-align:middle;font:bold 24px/1 Helvetica,Arial,sans-serif;letter-spacing:-0.5px;color:#131313">ceval</td></tr></table>`;

export async function sendLoginCode(
  env: Env,
  email: string,
  otp: string,
): Promise<void> {
  if (isLocalEnvironment(env)) {
    console.log(`Ceval local sign-in code: ${otp}`);
    return;
  }
  if (!env.RESEND_API_KEY || !env.AUTH_EMAIL_FROM)
    throw new Error("Email unavailable");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({
      from: env.AUTH_EMAIL_FROM,
      to: [email],
      subject: `${otp} is your Ceval sign-in code`,
      text: `Your Ceval sign-in code is ${otp}. It expires in 5 minutes. If you did not request this code, you can ignore this email.`,
      html: `<div style="margin:0;padding:40px 16px;background:#f3f3f0;color:#131313;font-family:Helvetica,Arial,sans-serif"><div style="max-width:440px;margin:0 auto;padding:32px;border:1px solid #e1e1dc;border-radius:18px;background:#fafaf8">${LOGO}<h1 style="margin:28px 0 8px;font:bold 22px/1.25 Helvetica,Arial,sans-serif">Your sign-in code</h1><p style="margin:0 0 20px;font:16px/1.5 Helvetica,Arial,sans-serif;color:#5b5c57">Enter this code in Ceval to sign in. It expires in 5 minutes.</p><p style="margin:0;padding:16px 20px;border-radius:12px;background:#e4e5df;font:bold 34px/1.2 Menlo,Consolas,'Courier New',monospace;letter-spacing:8px;color:#131313">${otp}</p><p style="margin:28px 0 0;font:13px/1.5 Helvetica,Arial,sans-serif;color:#5b5c57">If you didn’t request this code, you can ignore this email.</p></div></div>`,
    }),
  });
  await response.body?.cancel();
  if (!response.ok) throw new Error("Email delivery unavailable");
}
