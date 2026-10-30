import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins/email-otp";
import { sendLoginCode } from "./email.ts";
export const signupsEnabled = (env: Env) =>
  String(env.SIGNUPS_ENABLED) === "true";
export function createAuth(env: Env, onDeliveryError?: () => void) {
  return betterAuth({
    appName: "Ceval",
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.BETTER_AUTH_URL],
    logger: { disabled: true },
    emailAndPassword: { enabled: false },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    advanced: {
      useSecureCookies: true,
      cookiePrefix: "ceval",
      defaultCookieAttributes: {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
      },
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
    },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 60 },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 300,
        allowedAttempts: 3,
        storeOTP: "hashed",
        disableSignUp: !signupsEnabled(env),
        resendStrategy: "rotate",
        rateLimit: { window: 60, max: 10 },
        async sendVerificationOTP({ email, otp, type }) {
          if (type !== "sign-in")
            throw new Error("Unsupported email operation");
          try {
            await sendLoginCode(env, email, otp);
          } catch {
            onDeliveryError?.();
            throw new Error("Email delivery unavailable");
          }
        },
      }),
    ],
  });
}
