import { useState } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, ScanLine } from "lucide-react";
import { Brand } from "../components/Brand";
import "../styles/landing.css";

export function Landing() {
  const [intent, setIntent] = useState<"buy" | "resale">("buy");
  return (
    <div className="cinematic">
      <header className="site-header film-header">
        <Brand />
        <nav aria-label="Main navigation">
          <a className="quiet-link film-nav-story" href="#perspective">
            The idea
          </a>
          <a className="quiet-link" href="/signin">
            Sign in
          </a>
          <a className="button primary small" href="/app">
            Open app <ArrowUpRight size={15} />
          </a>
        </nav>
      </header>
      <main>
        <section className="film-hero" aria-labelledby="landing-title">
          <picture className="film-hero-image">
            <source
              media="(max-width: 640px)"
              srcSet="/campaign/portrait-640.jpg 640w, /campaign/portrait-960.jpg 960w"
              sizes="100vw"
            />
            <img
              src="/campaign/hero-1600.jpg"
              srcSet="/campaign/hero-960.jpg 960w, /campaign/hero-1600.jpg 1600w"
              sizes="100vw"
              width="1600"
              height="900"
              fetchPriority="high"
              alt="A woman wearing smart glasses browsing a warmly lit camera shop; generated concept photograph"
            />
          </picture>
          <div className="film-hero-shade" />

          <div className="film-hero-copy">
            <h1 id="landing-title">
              See what
              <br />
              it’s worth.
            </h1>
            <p>
              Online prices. Resale listings.
              <br />
              From what’s right in front of you.
            </p>
            <a className="button primary film-cta" href="/app">
              Try with your phone <ArrowUpRight size={18} />
            </a>
          </div>
          <div className="film-hero-bottom">
            <a href="#perspective" className="film-scroll">
              <ArrowDown size={16} />
              <span>Take a closer look</span>
            </a>
            <span>Ray-Ban Meta experience · Concept</span>
          </div>
        </section>
        <section
          className="film-perspective film-wrap"
          id="perspective"
          aria-labelledby="perspective-title"
        >
          <div className="film-section-heading">
            <div>
              <span className="film-index">01 / LOOK</span>
              <h2 id="perspective-title">Your point of view.</h2>
            </div>
          </div>
          <figure className="film-detail">
            <img
              src="/campaign/detail-1600.jpg"
              srcSet="/campaign/detail-960.jpg 960w, /campaign/detail-1600.jpg 1600w"
              sizes="(max-width: 640px) 100vw, 92vw"
              width="1600"
              height="900"
              loading="lazy"
              decoding="async"
              alt="Close-up of the same wearer’s smart glasses, with the shop reflected in the lenses; generated concept photograph"
            />
            <figcaption>
              <span>Ray-Ban Meta · Concept</span>
              <ScanLine size={20} />
            </figcaption>
          </figure>
        </section>
        <section
          className="film-compare film-wrap"
          aria-labelledby="compare-title"
        >
          <div className="film-section-heading">
            <div>
              <span className="film-index">02 / COMPARE</span>
              <h2 id="compare-title">Beyond the price tag.</h2>
            </div>
            <div
              className="film-intent"
              role="group"
              aria-label="Preview comparison mode"
            >
              <button
                aria-pressed={intent === "buy"}
                onClick={() => setIntent("buy")}
              >
                Buy better
              </button>
              <button
                aria-pressed={intent === "resale"}
                onClick={() => setIntent("resale")}
              >
                Explore resale
              </button>
            </div>
          </div>
          <div className="film-pov">
            <div className="film-pov-scene">
              <picture>
                <source
                  media="(max-width: 640px)"
                  srcSet="/campaign/perspective-portrait-640.jpg 640w, /campaign/perspective-portrait-960.jpg 960w"
                  sizes="100vw"
                />
                <img
                  src="/campaign/perspective-1600.jpg"
                  srcSet="/campaign/perspective-960.jpg 960w, /campaign/perspective-1600.jpg 1600w"
                  sizes="92vw"
                  width="1600"
                  height="900"
                  loading="lazy"
                  decoding="async"
                  alt="First-person view of a Canon EOS 80D body on the same shop shelf with an illustrative $349 price card"
                />
              </picture>
              <div className="film-pov-shade" />
              <span className="film-pov-label">
                <span className="lime-dot" /> WEARER’S PERSPECTIVE
              </span>
              <div className="film-target" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
                <span>Canon EOS 80D</span>
              </div>
            </div>
            <div className="film-comparison" aria-live="polite">
              <div className="film-comparison-label">
                <ScanLine size={16} />
                <span>ILLUSTRATIVE COMPARISON</span>
              </div>
              <h3>Canon EOS 80D</h3>
              <p className="film-condition">Body only · Used</p>
              <div className="film-shelf">
                <span>On the shelf</span>
                <span>$349</span>
              </div>
              <div className="film-offer">
                <span>
                  {intent === "buy"
                    ? "Example online offer"
                    : "Example asking price"}
                </span>
                <strong>{intent === "buy" ? "$329" : "$379"}</strong>
              </div>
              <p className="film-example-note">
                Illustrative prices, not live offers.
                {intent === "resale"
                  ? " Asking prices are not completed sales."
                  : ""}
              </p>
              <a href="/app">
                Try the phone preview <ArrowUpRight size={17} />
              </a>
            </div>
          </div>
        </section>
        <section className="film-start film-wrap" id="try">
          <div>
            <span className="film-index">03 / TRY IT</span>
            <h2>
              Start with
              <br />
              your phone.
            </h2>
            <p>Open your camera or choose a video.</p>
          </div>
          <a className="button primary film-cta" href="/app">
            Open Ceval <ArrowRight size={18} />
          </a>
        </section>
      </main>
      <footer className="film-footer film-wrap">
        <Brand />
        <p>
          Generated imagery · Glasses concept
          <br />
          Phone web app available in preview
        </p>
        <a href="/app">
          Take a look <ArrowUpRight size={14} />
        </a>
      </footer>
    </div>
  );
}
