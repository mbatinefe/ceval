import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { Brand, BrandMark } from "../components/Brand";
import { useThemeColor } from "../lib/theme-color";
import "../styles/landing.css";

function Price({
  value,
  className = "",
}: {
  value: string;
  className?: string;
}) {
  const [whole, cents = "00"] = value.split(".");
  return (
    <span className={`lp-price ${className}`.trim()}>
      <span className="lp-sr-only">${value}</span>
      <span className="lp-price-cur" aria-hidden="true">
        $
      </span>
      <span className="lp-price-whole" aria-hidden="true">
        {whole}
      </span>
      <span className="lp-price-cents" aria-hidden="true">
        {cents}
      </span>
    </span>
  );
}

const barcode = [
  2, 1, 1, 2, 3, 1, 1, 1, 2, 2, 1, 3, 1, 1, 2, 1, 1, 2, 2, 1, 3, 1, 1, 2, 1, 1,
  1, 3, 2, 1, 1, 2, 1, 1, 3, 1, 2, 1, 1, 2,
];

function Barcode({ className = "lp-barcode" }: { className?: string }) {
  let x = 0;
  const bars = barcode.map((width, index) => {
    const bar = index % 2 === 0 ? { x, width } : null;
    x += width;
    return bar;
  });
  return (
    <svg
      className={className}
      viewBox={`0 0 ${x} 20`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {bars.map((bar, index) =>
        bar ? (
          <rect key={index} x={bar.x} y="0" width={bar.width} height="20" />
        ) : null,
      )}
    </svg>
  );
}

function Corners({ className }: { className: string }) {
  return (
    <span className={className} aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

// An electronic shelf label that Ceval reads, then updates with its own price.
function ShelfLabel() {
  return (
    <div className="lp-esl" aria-hidden="true">
      <Corners className="lp-esl-corners" />
      <div className="lp-esl-body">
        <div className="lp-esl-screen">
          <div className="lp-esl-face lp-esl-before">
            <div className="lp-esl-head">
              <strong>Wireless headphones</strong>
              <span>Over-ear · Black</span>
            </div>
            <div className="lp-esl-foot">
              <span className="lp-esl-code">
                <Barcode />
                <small>0 49738 21904</small>
              </span>
              <Price value="249.00" />
            </div>
          </div>
          <div className="lp-esl-face lp-esl-after">
            <div className="lp-esl-head">
              <strong>Wireless headphones</strong>
              <span className="lp-esl-mark">
                <BrandMark /> ceval
              </span>
            </div>
            <p className="lp-esl-sub">Same model · 3 offers online</p>
            <div className="lp-esl-foot">
              <span className="lp-esl-was">
                <small>Shelf</small>
                <s>$249.00</s>
              </span>
              <span className="lp-esl-now">
                <small>Online from</small>
                <Price value="219.00" />
              </span>
            </div>
          </div>
          <span className="lp-esl-flash" />
        </div>
        <span className="lp-esl-led" />
      </div>
    </div>
  );
}

const shelfPhoto = {
  src: "/campaign/v4/hero-shelf-960.jpg",
  srcSet:
    "/campaign/v4/hero-shelf-640.jpg 640w, /campaign/v4/hero-shelf-960.jpg 960w",
};

// The Ceval scanner as it looks on a phone, drawn at app size and scaled.
function HeroPhone() {
  return (
    <figure className="lp-device-wrap">
      <div
        className="lp-device"
        role="img"
        aria-label="Ceval on a phone. The camera locks onto a shelf label that reads $249.00, and Ceval shows the same headphones online for $219.00."
      >
        <div className="lp-device-screen">
          <div className="lp-ui" aria-hidden="true">
            <div className="lp-ui-status">
              <span>9:41</span>
              <i className="lp-ui-island" />
              <span className="lp-ui-icons">
                <svg viewBox="0 0 18 12">
                  <rect x="0" y="8" width="3" height="4" rx="1" />
                  <rect x="5" y="5.5" width="3" height="6.5" rx="1" />
                  <rect x="10" y="3" width="3" height="9" rx="1" />
                  <rect x="15" y="0" width="3" height="12" rx="1" />
                </svg>
                <svg viewBox="0 0 16 12">
                  <path d="M8 2.2c2.4 0 4.6.9 6.2 2.4l1.3-1.4A10.9 10.9 0 0 0 8 .3 10.9 10.9 0 0 0 .5 3.2l1.3 1.4A8.9 8.9 0 0 1 8 2.2Zm0 3.8c1.4 0 2.6.5 3.6 1.4l1.3-1.4A7.2 7.2 0 0 0 8 4.1a7.2 7.2 0 0 0-4.9 1.9l1.3 1.4C5.4 6.5 6.6 6 8 6Zm0 3.7c.5 0 1 .2 1.3.5L8 11.7l-1.3-1.5c.3-.3.8-.5 1.3-.5Z" />
                </svg>
                <span className="lp-ui-battery">
                  <i />
                </span>
              </span>
            </div>
            <div className="lp-ui-header">
              <span className="lp-ui-brand">
                <BrandMark />
                ceval
              </span>
              <span className="lp-ui-nav">
                <b>Scan</b>
                <span>Finds</span>
                <span>Account</span>
              </span>
            </div>
            <div className="lp-ui-controls">
              <span className="lp-ui-modes">
                <b>Buy cheaper</b>
                <span>Resale value</span>
              </span>
              <span className="lp-ui-market">
                US<small>USD</small>
              </span>
            </div>
            <div className="lp-ui-stage">
              <img
                src={shelfPhoto.src}
                srcSet={shelfPhoto.srcSet}
                sizes="320px"
                width="1024"
                height="1536"
                fetchPriority="high"
                decoding="async"
                alt=""
              />
              <span className="lp-ui-live">
                <i />
                Live camera
              </span>
              <span className="lp-ui-tag">
                <strong>Wireless headphones</strong>
                <span>
                  <Barcode className="lp-ui-barcode" />
                  <b>$249.00</b>
                </span>
              </span>
              <Corners className="lp-ui-lock" />
              <span className="lp-ui-pin">
                <i>1</i>
                <span>
                  <small>Online</small>
                  <Price value="219.00" />
                </span>
              </span>
            </div>
            <div className="lp-ui-scanning">
              <span>
                <i />
                Scanning. Keep the model label in view.
              </span>
              <b>Pause scan</b>
            </div>
            <div className="lp-ui-card">
              <div className="lp-ui-card-head">
                <img
                  src="/campaign/v4/hero-shelf-640.jpg"
                  width="1024"
                  height="1536"
                  decoding="async"
                  alt=""
                />
                <span>
                  <small>In view · Headphones</small>
                  <b>Over-ear wireless, black</b>
                </span>
              </div>
              <div className="lp-ui-prices">
                <span>
                  <small>Shelf label</small>
                  <s>$249.00</s>
                </span>
                <span className="is-found">
                  <small>Online price</small>
                  <Price value="219.00" />
                </span>
              </div>
              <p className="lp-ui-evidence">
                <b>Online retailer</b> · New
                <strong>$30.00 below the shelf label</strong>
              </p>
              <div className="lp-ui-actions">
                <b>View prices ↗</b>
                <span>Photo matches ›</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <figcaption>The Ceval scanner. Example prices.</figcaption>
    </figure>
  );
}

const questions: [string, string][] = [
  [
    "Where does Ceval work?",
    "In your phone’s browser, in Safari or Chrome. There’s no app to install.",
  ],
  [
    "What does it read best?",
    "Electronics and boxed products with a visible model name or number.",
  ],
  [
    "Which markets does it cover?",
    "The United States, the United Kingdom and Türkiye, in local currency.",
  ],
  [
    "Can I use a video instead?",
    "Yes. Scan live, or choose a video up to 10 minutes long.",
  ],
  [
    "When does it use the camera?",
    "Only after you tap to start. You can stop at any time.",
  ],
  [
    "What leaves my phone?",
    "Selected frames, sent to Meta’s Muse Spark model to recognize products and search prices. Your full video stays on your device.",
  ],
  [
    "What does Ceval save?",
    "Your recent finds and small product photos, in your account. Delete one or all of them at any time.",
  ],
  [
    "Are these sold prices?",
    "No. Store prices are current offers, and marketplace prices are what sellers are asking, not completed sales.",
  ],
];

export function Landing() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useThemeColor("#ffffff");
  // Feature illustrations play once they scroll into view.
  useEffect(() => {
    const items = document.querySelectorAll<HTMLElement>("[data-reveal]");
    if (!("IntersectionObserver" in window)) {
      items.forEach((item) => (item.dataset.in = "true"));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          (entry.target as HTMLElement).dataset.in = "true";
          observer.unobserve(entry.target);
        }),
      { threshold: 0.4 },
    );
    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, []);
  return (
    <div className="lp">
      <a className="lp-skip" href="#lp-main">
        Skip to content
      </a>
      <header className="lp-top" data-scrolled={scrolled}>
        <div className="lp-wrap lp-top-inner">
          <Brand />
          <nav aria-label="Main navigation">
            <a className="lp-top-link lp-top-optional" href="#features">
              How it works
            </a>
            <a className="lp-top-link lp-top-optional" href="#fine-print">
              Fine print
            </a>
            <a className="lp-top-link" href="/signin">
              Sign in
            </a>
            <a className="lp-btn lp-btn-ink lp-btn-sm" href="/app">
              Open Ceval
            </a>
          </nav>
        </div>
      </header>
      <main id="lp-main">
        <section className="lp-hero" aria-labelledby="lp-title">
          <div className="lp-wrap lp-hero-grid">
            <div className="lp-hero-copy">
              <h1 id="lp-title">Is this a good price?</h1>
              <p className="lp-hero-lede">
                Point your phone at a product and its price tag. Ceval finds the
                same model online and secondhand, and shows where every price
                came from.
              </p>
              <div className="lp-hero-actions">
                <a className="lp-btn lp-btn-ink" href="/app">
                  Open Ceval
                </a>
                <a className="lp-btn lp-btn-quiet" href="#features">
                  See how it works
                </a>
              </div>
              <p className="lp-hero-note">
                Works in your phone’s browser. No app to install.
              </p>
            </div>
            <HeroPhone />
          </div>
        </section>

        <section
          className="lp-section lp-features"
          id="features"
          aria-labelledby="features-title"
        >
          <div className="lp-wrap">
            <div className="lp-section-head">
              <h2 id="features-title">What a scan tells you</h2>
              <p>
                Ceval reads the product and its price tag, then checks the same
                model online and secondhand. The examples below use illustrative
                prices.
              </p>
            </div>
            <div className="lp-bento">
              <article className="lp-card lp-card-buy" data-reveal>
                <div className="lp-card-copy">
                  <p className="lp-card-kicker">Buy cheaper</p>
                  <h3>Is it cheaper somewhere else?</h3>
                  <p>
                    Ceval checks current offers for the same model and shows how
                    much less it costs online. Item prices only, before shipping
                    and tax.
                  </p>
                </div>
                <div className="lp-rail">
                  <span className="lp-rail-bar" />
                  <ShelfLabel />
                </div>
              </article>

              <article className="lp-card lp-card-resale" data-reveal>
                <div className="lp-card-copy">
                  <p className="lp-card-kicker">Resale value</p>
                  <h3>What’s it worth secondhand?</h3>
                  <p>
                    See what similar used items are listed for on public
                    marketplaces. These are asking prices, not sales.
                  </p>
                </div>
                <div className="lp-panel lp-range" aria-hidden="true">
                  <div className="lp-range-item">
                    <img
                      src="/campaign/v3/resale-camera-640.jpg"
                      width="640"
                      height="427"
                      loading="lazy"
                      decoding="async"
                      alt=""
                    />
                    <span>
                      <b>35mm film camera</b>
                      <small>Used · 3 listings</small>
                    </span>
                  </div>
                  <div className="lp-range-scale">
                    <span className="lp-range-tag">
                      <small>Market tag</small>$45
                    </span>
                    <span className="lp-range-listed">
                      <small>Listed for</small>$95–140
                    </span>
                    <span className="lp-range-track">
                      <i className="lp-range-band" />
                      <i className="lp-range-dot" />
                    </span>
                  </div>
                </div>
              </article>

              <article className="lp-card lp-card-sources" data-reveal>
                <div className="lp-card-copy">
                  <p className="lp-card-kicker">Sources</p>
                  <h3>Every price links to its page.</h3>
                  <p>
                    Each offer shows the store, the condition and when it was
                    checked. If a price can’t be verified, Ceval says so.
                  </p>
                </div>
                <div className="lp-panel lp-sources" aria-hidden="true">
                  {[
                    ["Online retailer", "$219.00", "New · Exact match", true],
                    [
                      "Electronics store",
                      "$229.00",
                      "New · Exact match",
                      false,
                    ],
                    ["Marketplace", "$155.00", "Used · Asking price", false],
                  ].map(([store, price, detail, lower]) => (
                    <div className="lp-source" key={String(store)}>
                      <span className="lp-source-row">
                        <b>
                          {store}
                          <ArrowUpRight />
                        </b>
                        <i />
                        <strong className={lower ? "is-lower" : undefined}>
                          {price}
                        </strong>
                      </span>
                      <small>{detail}</small>
                    </div>
                  ))}
                  <p className="lp-sources-time">Checked 14:02</p>
                </div>
              </article>

              <article className="lp-card lp-card-models" data-reveal>
                <div className="lp-card-copy">
                  <p className="lp-card-kicker">Model check</p>
                  <h3>When models look alike, you choose.</h3>
                  <p>
                    Ceval compares product photos and asks before it searches,
                    so you don’t get prices for the wrong model.
                  </p>
                </div>
                <div className="lp-panel lp-models" aria-hidden="true">
                  <p className="lp-models-title">Which one is yours?</p>
                  {[
                    ["Over-ear, slim headband", "Looks close", true],
                    ["Over-ear, slider headband", "Similar design", false],
                  ].map(([name, match, likely]) => (
                    <div
                      className={`lp-model${likely ? " is-chosen" : ""}`}
                      key={String(name)}
                    >
                      <img
                        src="/campaign/v4/hero-shelf-640.jpg"
                        width="1024"
                        height="1536"
                        loading="lazy"
                        decoding="async"
                        alt=""
                      />
                      <span>
                        <b>{name}</b>
                        <small className={likely ? "is-likely" : undefined}>
                          {match}
                        </small>
                      </span>
                    </div>
                  ))}
                </div>
              </article>

              <article className="lp-card lp-card-browser">
                <div className="lp-card-copy">
                  <p className="lp-card-kicker">No app to install</p>
                  <h3>Open it in your phone’s browser.</h3>
                  <p>Works in Safari and Chrome. Sign in with an email code.</p>
                </div>
                <div className="lp-panel lp-qr">
                  <img
                    src="/campaign/v3/open-app-qr.svg"
                    width="112"
                    height="112"
                    loading="lazy"
                    alt="QR code that opens Ceval"
                  />
                  <p>Scan with your phone’s camera to open Ceval.</p>
                </div>
                <a className="lp-btn lp-btn-ink lp-card-open" href="/app">
                  Open Ceval
                </a>
              </article>
            </div>
          </div>
        </section>

        <section className="lp-next" aria-labelledby="next-title">
          <picture className="lp-next-photo">
            <source
              media="(max-width: 700px)"
              srcSet="/campaign/v2/city-wearer-portrait-640.jpg 640w, /campaign/v2/city-wearer-portrait-960.jpg 960w"
              sizes="100vw"
            />
            <img
              src="/campaign/v2/city-wearer-1600.jpg"
              srcSet="/campaign/v2/city-wearer-960.jpg 960w, /campaign/v2/city-wearer-1600.jpg 1600w"
              sizes="100vw"
              loading="lazy"
              decoding="async"
              alt="A woman wearing camera glasses looks into a shop window at dusk. Concept image."
            />
          </picture>
          <div className="lp-wrap lp-next-copy">
            <p className="lp-next-status">Concept · Not available yet</p>
            <h2 id="next-title">Next: camera glasses</h2>
            <p>
              We’re exploring Ceval on camera glasses, so you can check a price
              without reaching for your phone.
            </p>
          </div>
        </section>

        <section
          className="lp-section lp-faq"
          id="fine-print"
          aria-labelledby="fine-print-title"
        >
          <div className="lp-wrap lp-faq-grid">
            <h2 id="fine-print-title">The fine print</h2>
            <dl className="lp-faq-list">
              {questions.map(([question, answer]) => (
                <div key={question}>
                  <dt>{question}</dt>
                  <dd>{answer}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="lp-closing" aria-labelledby="closing-title">
          <div className="lp-wrap">
            <div className="lp-closing-card">
              <span className="lp-closing-mark" aria-hidden="true">
                <BrandMark />
              </span>
              <h2 id="closing-title">Try it on the next price tag you see.</h2>
              <a className="lp-btn lp-btn-light" href="/app">
                Open Ceval
              </a>
            </div>
          </div>
        </section>
      </main>
      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-inner">
          <Brand />
          <nav aria-label="Footer navigation">
            <a href="#features">How it works</a>
            <a href="#fine-print">Fine print</a>
            <a href="/signin">Sign in</a>
            <a href="/app">Open Ceval</a>
          </nav>
          <p>
            Photographs and illustrations on this page are generated. Prices
            shown are examples, not live offers.
          </p>
        </div>
      </footer>
    </div>
  );
}
