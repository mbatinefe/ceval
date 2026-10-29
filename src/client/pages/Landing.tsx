import {
  ArrowUpRight,
  ArrowRight,
  ScanLine,
  Tag,
  Bookmark,
  Sparkles,
  MoveUpRight,
} from "lucide-react";
import { Brand } from "../components/Brand";
export function Landing() {
  return (
    <div className="landing">
      <header className="site-header wrap">
        <Brand />
        <nav aria-label="Main navigation">
          <a className="quiet-link" href="#the-idea">
            The idea
          </a>
          <a className="button small dark" href="/app">
            Open Ceval <ArrowUpRight size={16} />
          </a>
        </nav>
      </header>
      <main>
        <section className="hero wrap">
          <div className="hero-copy">
            <span className="eyebrow">
              <i /> A NEW WAY TO LOOK AT THINGS
            </span>
            <h1>
              See something.
              <br />
              See its <em>worth.</em>
            </h1>
            <p>
              Your next good find is hiding in plain sight. We’re building a way
              to turn what you see into prices you can compare.
            </p>
            <a className="button primary" href="/app">
              Open Ceval <ArrowUpRight size={20} />
            </a>
            <div className="hero-note">
              <span className="tiny-dot" /> Camera or video · Early access
            </div>
            <div className="hero-proof">
              <span>
                <ScanLine size={18} /> Look closer
              </span>
              <span>
                <Tag size={18} /> Know the value
              </span>
              <span>
                <Bookmark size={18} /> Keep the find
              </span>
            </div>
          </div>
          <div className="hero-art">
            <div className="art-grid" />
            <span className="art-caption">GOOD FINDS ARE EVERYWHERE.</span>
            <div className="phone-scene">
              <img
                src="/demo/electronics-shelf.png"
                alt="Simulated electronics shelf with headphones, a mouse and a speaker"
                fetchPriority="high"
              />
              <div className="scene-top">
                <span>
                  <i /> SIMULATED STORE
                </span>
                <ScanLine size={19} />
              </div>
              <span className="corner tl" />
              <span className="corner tr" />
              <span className="corner bl" />
              <span className="corner br" />
              <div className="hero-product">
                <span className="product-dot" />
                <div>
                  <small>EXAMPLE PRODUCT</small>
                  <strong>Sony WH-1000XM5</strong>
                  <span>Headphones · Black</span>
                </div>
                <ArrowUpRight size={20} />
              </div>
              <div className="scene-bottom">
                A little curiosity goes a long way.
              </div>
            </div>
            <div className="floating-note">
              <Sparkles size={19} />
              <div>
                <strong>There’s more to the price tag.</strong>
                <span>Start with a closer look.</span>
              </div>
            </div>
            <span className="art-number">01 / THE EVERYDAY DISCOVERY</span>
          </div>
        </section>
        <section id="the-idea" className="idea-section wrap">
          <div className="section-heading">
            <span className="eyebrow">THE IDEA BEHIND CEVAL</span>
            <h2>
              A better question than
              <br />
              “Should I buy it?”
            </h2>
            <p>
              What does it cost elsewhere?
              <br />
              What could it be worth to someone else?
            </p>
          </div>
          <div className="idea-cards">
            <article className="idea-card">
              <span className="card-icon">
                <Tag size={23} />
              </span>
              <span className="card-index">01</span>
              <h3>Buy with context.</h3>
              <p>
                The goal: compare the exact product with sourced online offers,
                so the shelf price is only the beginning.
              </p>
              <span className="card-label">
                BUY CHEAPER <MoveUpRight size={16} />
              </span>
            </article>
            <article className="idea-card green">
              <span className="card-icon">
                <Bookmark size={23} />
              </span>
              <span className="card-index">02</span>
              <h3>Spot the potential.</h3>
              <p>
                Explore resale comparisons with a clear distinction between what
                people ask and what actually sold.
              </p>
              <span className="card-label">
                EXPLORE RESALE <MoveUpRight size={16} />
              </span>
            </article>
          </div>
        </section>
        <section className="preview-strip wrap">
          <div>
            <span className="eyebrow">A SMALL PREVIEW. A BIGGER IDEA.</span>
            <h2>Take a look around.</h2>
            <p>
              Explore three sample products and save your favorites.
              <br />
              Live recognition and price comparisons are coming next.
            </p>
          </div>
          <a className="button dark" href="/app">
            Try Ceval <ArrowRight size={19} />
          </a>
        </section>
      </main>
      <footer className="site-footer wrap">
        <Brand />
        <span>Made for the curious.</span>
        <span>Interactive demo · 2026</span>
      </footer>
    </div>
  );
}
