import { useState } from "react";
import { LogOut, Trash2, ArrowUpRight, Check } from "lucide-react";
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
        api("/api/scan/history", {}, "DELETE"),
      ]);
      setMessage(
        "Your saved finds, recent scan history and product photos have been cleared.",
      );
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
          <h1>Account</h1>
        </div>
      </div>
      <div className="account-grid">
        <section className="account-card account-identity">
          <div className="account-avatar" aria-hidden="true">
            {profile.user.email[0]?.toUpperCase()}
          </div>
          <div>
            <span className="eyebrow">Signed in as</span>
            <p className="account-email">{profile.user.email}</p>
            <span className="verified">
              <Check aria-hidden="true" /> Email verified
            </span>
          </div>
          <button
            className="button outline small"
            onClick={signOut}
            disabled={busy}
          >
            <LogOut aria-hidden="true" /> Sign out
          </button>
        </section>
        <section className="account-card">
          <h2>Scanner</h2>
          <p>
            {profile.capabilities.liveScanning
              ? "Camera and video analysis are on. Clear model labels give the strongest matches. Usage allowances apply to analysis and price searches."
              : "Camera and video preview are available. Product recognition and price comparisons are waiting for analysis access."}
          </p>
          <a className="text-link" href="/app">
            Open scanner <ArrowUpRight aria-hidden="true" />
          </a>
        </section>
        <section className="account-card">
          <h2>Privacy</h2>
          <p>
            Saved finds are linked to your account. Camera access is requested
            only when you choose it. The full video stays on your device;
            selected frames go to Meta when you start scanning. Ceval keeps up
            to 100 recent finds with small product photos. You can remove single
            scans in Your finds or clear them all here.
          </p>
          {confirm ? (
            <div className="confirm-delete">
              <p>
                Remove all saved finds, recent scan history and product photos?
                This can’t be undone.
              </p>
              <div>
                <button
                  className="button danger small"
                  onClick={clear}
                  disabled={busy}
                >
                  Clear finds and photos
                </button>
                <button
                  className="text-button"
                  onClick={() => setConfirm(false)}
                  disabled={busy}
                >
                  Keep them
                </button>
              </div>
            </div>
          ) : (
            <button
              className="text-link is-danger"
              onClick={() => setConfirm(true)}
            >
              <Trash2 aria-hidden="true" /> Clear finds and photos
            </button>
          )}
        </section>
        {message && (
          <p className="account-message" role="status">
            {message}
          </p>
        )}
      </div>
    </main>
  );
}
