export async function sendLoginCode(
  env: Env,
  email: string,
  otp: string,
): Promise<void> {
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
      html: `<div style="margin:0;padding:40px 16px;background:#f3f3f0;color:#131313;font-family:Helvetica,Arial,sans-serif"><div style="max-width:440px;margin:0 auto;padding:32px;border:1px solid #e1e1dc;border-radius:18px;background:#fafaf8"><table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr><td style="padding:0;vertical-align:middle"><table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr><td style="width:12px;height:12px;padding:0;background:#131313;border-radius:3px 0 0 0;font-size:0;line-height:0"></td><td style="width:2px;height:12px;padding:0;background:#131313;font-size:0;line-height:0"></td><td style="width:14px;height:12px;padding:0;background:#131313;border-radius:0 3px 0 0;font-size:0;line-height:0"></td></tr><tr><td style="width:12px;height:2px;padding:0;background:#131313;font-size:0;line-height:0"></td><td style="width:2px;height:2px;padding:0;font-size:0;line-height:0"></td><td style="width:14px;height:2px;padding:0;font-size:0;line-height:0"></td></tr><tr><td style="width:12px;height:14px;padding:0;background:#131313;border-radius:0 0 0 3px;font-size:0;line-height:0"></td><td style="width:2px;height:14px;padding:0;font-size:0;line-height:0"></td><td style="width:14px;height:14px;padding:0;background:#c4161c;border-radius:0 0 3px 0;font-size:0;line-height:0"></td></tr></table></td><td style="padding:0 0 0 10px;vertical-align:middle;font:bold 24px/1 Helvetica,Arial,sans-serif;letter-spacing:-0.5px;color:#131313">ceval</td></tr></table><h1 style="margin:28px 0 8px;font:bold 22px/1.25 Helvetica,Arial,sans-serif">Your sign-in code</h1><p style="margin:0 0 20px;font:16px/1.5 Helvetica,Arial,sans-serif;color:#5b5c57">Enter this code in Ceval to sign in. It expires in 5 minutes.</p><p style="margin:0;padding:16px 20px;border-radius:12px;background:#e4e5df;font:bold 34px/1.2 Menlo,Consolas,'Courier New',monospace;letter-spacing:8px;color:#131313">${otp}</p><p style="margin:28px 0 0;font:13px/1.5 Helvetica,Arial,sans-serif;color:#5b5c57">If you didn’t request this code, you can ignore this email.</p></div></div>`,
    }),
  });
  await response.body?.cancel();
  if (!response.ok) throw new Error("Email delivery unavailable");
}
