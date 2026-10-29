import { useState } from "react";
import { LogOut, ShieldCheck, Trash2, ArrowUpRight, Check } from "lucide-react";
import type { Profile } from "../../shared/demo";
import { api } from "../lib/api";
export function Account({ profile }: { profile: Profile }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState(false);
  async function clear() {
    setBusy(true);
    try {
      await Promise.all([
        api("/api/finds", {}, "DELETE"),
        api("/api/comparisons", {}, "DELETE"),
      ]);
      setMessage("Your saved finds have been cleared.");
      setConfirm(false);
    } catch {
      setMessage("Couldn’t clear your finds. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    setBusy(true);
    try {
      await api("/api/auth/sign-out", {});
      window.location.assign("/");
    } catch {
      setMessage("Couldn’t sign out. Please try again.");
      setBusy(false);
    }
  }
  return (
    <main className="content-page account-page app-wrap">
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR LITTLE CORNER</span>
          <h1>
            Your account<span className="accent">.</span>
          </h1>
          <p>A few essentials. All yours to control.</p>
        </div>
      </div>
      <div className="account-grid">
        <section className="account-card">
          <div className="account-avatar">
            {profile.user.email[0]?.toUpperCase()}
          </div>
          <h2>You’re right at home.</h2>
          <p className="account-email">{profile.user.email}</p>
          <span className="verified">
            <Check size={15} /> Email verified
          </span>
          <hr />
          <button
            className="button outline full"
            onClick={signOut}
            disabled={busy}
          >
            <LogOut size={17} /> Sign out
          </button>
        </section>
        <div className="account-stack">
          <section className="account-card">
            <span className="eyebrow">PREVIEW ACCESS</span>
            <h2>Room to explore.</h2>
            <p>
              {profile.capabilities.liveScanning
                ? "Camera and video analysis are enabled. Clear model labels give the strongest matches. Usage allowances apply to analysis and price searches."
                : "Camera and video preview are available. Product recognition and price comparisons are waiting for analysis access."}
            </p>
            <a className="text-link" href="/app">
              Back to exploring <ArrowUpRight size={16} />
            </a>
          </section>
          <section className="account-card">
            <ShieldCheck size={24} />
            <h2>Your finds stay yours.</h2>
            <p>
              Saved finds are linked to your account. Camera access is requested
              only when you choose it. The full video stays on your device;
              selected frames go to Meta when you start scanning. Ceval does not
              save those frames.
            </p>
            {confirm ? (
              <div className="confirm-delete">
                <p>Remove all your saved finds? This can’t be undone.</p>
                <button
                  className="button danger small"
                  onClick={clear}
                  disabled={busy}
                >
                  Clear saved finds
                </button>
                <button
                  className="text-button"
                  onClick={() => setConfirm(false)}
                  disabled={busy}
                >
                  Keep them
                </button>
              </div>
            ) : (
              <button className="text-link" onClick={() => setConfirm(true)}>
                <Trash2 size={16} /> Clear saved finds
              </button>
            )}
          </section>
          {message && (
            <p className="account-message" role="status">
              {message}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
