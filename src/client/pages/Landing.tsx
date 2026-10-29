import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  ScanLine,
  Pause,
  Play,
  Bookmark,
  Check,
  ChevronRight,
} from "lucide-react";
import { Brand } from "../components/Brand";
export function Landing() {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [intent, setIntent] = useState<"buy" | "resale">("buy");
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    if (!preference.matches) void video.current?.play().catch(() => {});
    const update = () => {
      if (preference.matches) video.current?.pause();
    };
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  return (
    <div className="landing">
      <header className="site-header wrap">
        <Brand />
        <nav aria-label="Main navigation">
          <a className="quiet-link desktop-link" href="#how-it-works">
            How it works
          </a>
          <a className="quiet-link" href="/signin">
            Sign in
          </a>
          <a className="button small primary" href="/app">
            Open app <ArrowUpRight size={16} />
          </a>
        </nav>
      </header>
      <main>
        <section className="hero wrap">
          <div className="hero-copy">
            <span className="release-label">
              <i /> EARLY ACCESS
            </span>
            <h1>
              See it.
              <br />
              Know its <span>value.</span>
            </h1>
            <p>
              The price tag is just the start.
              <br />
              Point your camera. See what’s out there.
            </p>
            <div className="hero-actions">
              <a className="button primary" href="/app">
                Try Ceval <ArrowUpRight size={19} />
              </a>
              <a className="button ghost" href="#preview">
                <Play size={15} /> See it in motion
              </a>
            </div>
            <span className="hero-note">
              Your phone. Your browser. A better look.
            </span>
          </div>
          <div className="hero-visual" id="preview">
            <div className="visual-orbit orbit-one" />
            <div className="visual-orbit orbit-two" />
            <span className="visual-coordinate coordinate-top">
              CEVAL / FIELD OF VIEW
            </span>
            <div className="device">
              <div className="device-screen">
                <video
                  ref={video}
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  poster="/demo/electronics-wide-poster.jpg"
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  aria-label="Synthetic electronics store preview"
                >
                  <source src="/demo/electronics-wide.mp4" type="video/mp4" />
                </video>
                <div className="device-shade" />
                <div className="device-island" />
                <div className="device-top">
                  <span>
                    ceval<span>.</span>
                  </span>
                  <ScanLine size={20} />
                </div>
                <div className="focus-frame">
                  <i />
                  <i />
                  <i />
                  <i />
                  <span>01 / SONY WH-1000XM5</span>
                </div>
                <div className="device-result">
                  <div className="device-result-top">
                    <span className="lime-dot" /> EXAMPLE PRODUCT{" "}
                    <Check size={13} />
                  </div>
                  <h3>Sony WH-1000XM5</h3>
                  <p>Wireless headphones · Black</p>
                  <div className="device-result-action">
                    <span>
                      {intent === "buy"
                        ? "Compare online prices"
                        : "Explore resale listings"}
                    </span>
                    <ArrowUpRight size={16} />
                  </div>
                </div>
                <div className="device-bottom">
                  <span />
                  <span className="shutter">
                    <ScanLine size={22} />
                  </span>
                  <Bookmark size={19} />
                </div>
              </div>
            </div>
            <div className="floating-label">
              <span className="floating-icon">
                <ScanLine size={18} />
              </span>
              <div>
                <strong>
                  A second look.
                  <br />A smarter decision.
                </strong>
                <small>FROM SHELF TO SEARCH</small>
              </div>
            </div>
            <div className="preview-controls">
              <span>Illustrative preview · synthetic footage</span>
              <button
                className="icon-button"
                aria-label={playing ? "Pause preview" : "Play preview"}
                onClick={() => {
                  if (playing) video.current?.pause();
                  else void video.current?.play().catch(() => {});
                }}
              >
                {playing ? <Pause size={15} /> : <Play size={15} />}
              </button>
            </div>
          </div>
        </section>
        <section className="intent-strip wrap" aria-label="Explore Ceval">
          <div className="intent-title">
            One camera.
            <br />
            <span>Two ways to see more.</span>
          </div>
          <button
            aria-pressed={intent === "buy"}
            onClick={() => setIntent("buy")}
          >
            <span className="intent-index">01</span>
            <span>
              <strong>Buy better</strong>
              <small>Compare the exact model online.</small>
            </span>
            <ArrowUpRight size={22} />
          </button>
          <button
            aria-pressed={intent === "resale"}
            onClick={() => setIntent("resale")}
          >
            <span className="intent-index">02</span>
            <span>
              <strong>Spot potential</strong>
              <small>Check resale listings before you buy.</small>
            </span>
            <ArrowUpRight size={22} />
          </button>
        </section>
        <section className="discovery wrap" id="how-it-works">
          <div className="discovery-heading">
            <span className="eyebrow">LOOK. COMPARE. KEEP.</span>
            <h2>
              Good finds.
              <br />
              <span>Better informed.</span>
            </h2>
            <p>
              Clear model labels. Sourced prices.
              <br />
              Your next move is yours.
            </p>
          </div>
          <div className="discovery-scene">
            <img
              src="/demo/thrift-camera-poster.jpg"
              alt="Synthetic secondhand camera shop scene"
              loading="lazy"
            />
            <div className="discovery-shade" />
            <div className="scene-cross cross-one" />
            <div className="scene-cross cross-two" />
            <span className="scene-caption">SECONDHAND / FIRST INSTINCT</span>
            <div className="scene-card">
              <ScanLine size={20} />
              <div>
                <small>LOOK CLOSER</small>
                <strong>Canon EOS 80D</strong>
              </div>
              <ArrowUpRight size={20} />
            </div>
            <span className="synthetic-label">Synthetic scene</span>
          </div>
        </section>
        <section className="closing wrap">
          <div>
            <span className="eyebrow">A LITTLE CURIOSITY GOES A LONG WAY.</span>
            <h2>Take another look.</h2>
          </div>
          <a className="button primary" href="/app">
            Open Ceval <ArrowRight size={20} />
          </a>
        </section>
      </main>
      <footer className="site-footer wrap">
        <Brand />
        <span>Built for a better look.</span>
        <a href="/app">
          Try the preview <ChevronRight size={14} />
        </a>
      </footer>
    </div>
  );
}
