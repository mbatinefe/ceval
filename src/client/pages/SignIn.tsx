import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { Brand } from "../components/Brand";
import { api, ApiError } from "../lib/api";
import { useThemeColor } from "../lib/theme-color";
import "../styles/landing.css";
export function SignIn() {
  useThemeColor("#ffffff");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [signupsOpen, setSignupsOpen] = useState(false);
  useEffect(() => {
    let active = true;
    api<{ signupsEnabled: boolean }>("/api/auth/status")
      .then((status) => {
        if (active) setSignupsOpen(status.signupsEnabled);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  async function sendCode() {
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/email-otp/send-verification-otp", {
        email: email.trim(),
        type: "sign-in",
      });
      setStep("code");
      setOtp("");
      setCooldown(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t send the code.");
      if (err instanceof ApiError && err.retryAfter)
        setCooldown(err.retryAfter);
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (step === "email") return sendCode();
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/sign-in/email-otp", { email: email.trim(), otp });
      window.location.assign("/app");
    } catch (err) {
      setError(
        err instanceof ApiError && err.status < 500 && err.status !== 429
          ? "That code didn’t work. Check the latest email or request a new code."
          : err instanceof Error
            ? err.message
            : "Couldn’t sign in.",
      );
      setBusy(false);
    }
  }
  return (
    <div className="lp lp-signin">
      <header className="lp-top">
        <div className="lp-wrap lp-top-inner">
          <Brand />
          <a className="lp-top-link lp-back" href="/">
            <ArrowLeft aria-hidden="true" /> Back
          </a>
        </div>
      </header>
      <main className="lp-wrap lp-si-main">
        <section className="lp-si-panel" aria-labelledby="signin-title">
          <h1 id="signin-title">
            {step === "email" ? "Sign in to Ceval" : "Check your email"}
          </h1>
          <p className="lp-si-lede">
            {step === "email" ? (
              signupsOpen ? (
                "We’ll email you a six-digit code. There’s no password to remember."
              ) : (
                "Existing accounts can sign in with an email code. New sign-ups are paused for now."
              )
            ) : (
              <>
                If <strong>{email.trim()}</strong> can sign in, a six-digit code
                is on its way.
              </>
            )}
          </p>
          <form className="lp-si-form" onSubmit={submit}>
            {step === "email" ? (
              <>
                <label htmlFor="email">Email address</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={254}
                  required
                  disabled={busy}
                />
              </>
            ) : (
              <>
                <label htmlFor="otp">Six-digit code</label>
                <input
                  key="otp"
                  id="otp"
                  className="lp-si-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  required
                  autoFocus
                  disabled={busy}
                />
                <span className="lp-si-hint">
                  Use the latest code. It expires after five minutes.
                </span>
              </>
            )}
            {error && (
              <p className="lp-si-error" role="alert">
                {error}
              </p>
            )}
            <button
              className="lp-btn lp-btn-ink"
              type="submit"
              disabled={busy || (step === "email" && cooldown > 0)}
            >
              {busy ? (
                <>
                  <LoaderCircle className="spin" aria-hidden="true" />
                  {step === "email" ? "Sending code…" : "Signing in…"}
                </>
              ) : step === "email" ? (
                cooldown > 0 ? (
                  `Email me a code in ${cooldown}s`
                ) : (
                  "Email me a code"
                )
              ) : (
                "Sign in"
              )}
            </button>
          </form>
          {step === "code" ? (
            <div className="lp-si-actions">
              <button
                type="button"
                onClick={sendCode}
                disabled={busy || cooldown > 0}
              >
                {cooldown
                  ? `Send a new code in ${cooldown}s`
                  : "Send a new code"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep("email");
                  setError("");
                }}
                disabled={busy}
              >
                Use a different email
              </button>
              <p>Can’t find it? Check your spam folder.</p>
            </div>
          ) : (
            <p className="lp-si-foot">
              Your finds and product photos are saved to your account. You can
              delete them at any time.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
