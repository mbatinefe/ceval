import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ScanLine, Bookmark, UserRound, LoaderCircle } from "lucide-react";
import { Brand } from "./components/Brand";
import { Landing } from "./pages/Landing";
import { SignIn } from "./pages/SignIn";
import { Scanner } from "./pages/Scanner";
import { Finds } from "./pages/Finds";
import { Account } from "./pages/Account";
import { api, ApiError } from "./lib/api";
import type { Profile } from "../shared/demo";
import "./styles/app.css";

function Workspace() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState(false);
  const path = window.location.pathname;
  useEffect(() => {
    let active = true;
    api<Profile>("/api/me")
      .then((result) => {
        if (active) setProfile(result);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401)
          window.location.assign("/signin");
        else if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, []);
  const nav = [
    { href: "/app", label: "Scan", icon: ScanLine },
    { href: "/app/finds", label: "Finds", icon: Bookmark },
    { href: "/app/account", label: "Account", icon: UserRound },
  ];
  return (
    <div className="workspace">
      <header className="app-header">
        <div className="app-wrap app-header-inner">
          <Brand />
          <nav className="app-nav" aria-label="App navigation">
            {nav.map(({ href, label, icon: Icon }) => (
              <a
                key={href}
                href={href}
                aria-current={path === href ? "page" : undefined}
              >
                <Icon aria-hidden="true" />
                <span>{label}</span>
              </a>
            ))}
          </nav>
        </div>
      </header>
      {error ? (
        <main className="empty-state">
          <h1>Couldn’t load your account</h1>
          <p>Check your connection, then reload Ceval.</p>
          <button
            className="button primary"
            onClick={() => window.location.reload()}
          >
            Reload Ceval
          </button>
        </main>
      ) : !profile ? (
        <main className="empty-state">
          <LoaderCircle className="spin" aria-hidden="true" />
          <p>Loading your account…</p>
        </main>
      ) : path === "/app/finds" ? (
        <Finds />
      ) : path === "/app/account" ? (
        <Account profile={profile} />
      ) : (
        <Scanner />
      )}
    </div>
  );
}
const path = window.location.pathname;
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {path === "/" ? (
      <Landing />
    ) : path === "/signin" ? (
      <SignIn />
    ) : (
      <Workspace />
    )}
  </StrictMode>,
);
