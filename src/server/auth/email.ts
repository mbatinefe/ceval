export async function sendLoginCode(env: Env, email: string, otp: string): Promise<void> {
  if (!env.RESEND_API_KEY || !env.AUTH_EMAIL_FROM) throw new Error('Email unavailable');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({
      from: env.AUTH_EMAIL_FROM, to: [email], subject: `${otp} is your Ceval sign-in code`,
      text: `Your Ceval sign-in code is ${otp}. It expires in 5 minutes. If you did not request this code, you can ignore this email.`,
      html: `<div style="font-family:Arial,sans-serif;background:#f5f3ee;padding:40px 20px;color:#232722"><div style="max-width:440px;margin:auto;background:#fff;padding:36px;border-radius:20px"><strong style="font-size:28px">ceval<span style="color:#e66035">.</span></strong><h1 style="font-size:24px;margin-top:32px">Your next good find starts here.</h1><p>Use this code to sign in to Ceval:</p><p style="font-size:36px;letter-spacing:8px;font-weight:bold">${otp}</p><p>This code expires in 5 minutes.</p><p style="color:#73766e;font-size:13px;margin-top:32px">If you didn’t request this code, you can ignore this email.</p></div></div>`,
    }),
  });
  await response.body?.cancel();
  if (!response.ok) throw new Error('Email delivery unavailable');
}
