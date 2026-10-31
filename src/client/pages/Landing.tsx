import { useEffect, useState } from "react";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import { Brand, BrandMark } from "../components/Brand";
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
    <span className={`lp-price ${className}`}>
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

function Barcode() {
  let x = 0;
  const bars = barcode.map((width, index) => {
    const bar = index % 2 === 0 ? { x, width } : null;
    x += width;
    return bar;
  });
  return (
    <svg
      className="lp-barcode"
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

function PhoneExample() {
  return (
    <figure className="lp-phone" aria-labelledby="lp-phone-caption">
      <div className="lp-phone-body">
        <div className="lp-phone-screen">
          <img
            src="/campaign/v3/scan-resale-960.jpg"
            srcSet="/campaign/v3/scan-resale-640.jpg 640w, /campaign/v3/scan-resale-960.jpg 960w"
            sizes="(max-width: 860px) 78vw, 320px"
            loading="lazy"
            decoding="async"
            alt=""
          />
          <span className="lp-phone-island" aria-hidden="true" />
          <div className="lp-phone-modes" aria-hidden="true">
            <span>Buy cheaper</span>
            <span className="is-on">Resale value</span>
          </div>
          <Corners className="lp-phone-corners" />
          <div className="lp-phone-sheet" aria-hidden="true">
            <div className="lp-sheet-head">
              <strong>35mm film camera</strong>
              <span>Possible match</span>
            </div>
            <p className="lp-sheet-sub">
              Used · Check the model name on the body
            </p>
            <div className="lp-sheet-prices">
              <div>
                <small>Market tag</small>
                <b>$45</b>
              </div>
              <div className="is-ceval">
                <small>Listed for</small>
                <b>$95–140</b>
              </div>
            </div>
            <p className="lp-sheet-note">
              Asking prices from 3 listings. Not completed sales.
            </p>
            <span className="lp-sheet-button">See listings</span>
          </div>
        </div>
      </div>
      <figcaption id="lp-phone-caption">
        Resale value mode at a flea market. Example prices.
      </figcaption>
    </figure>
  );
}

function Receipt() {
  const offers: [string, string, string][] = [
    ["Online retailer", "219.00", "New · exact match"],
    ["Online retailer", "229.00", "New · exact match"],
    ["Marketplace", "155.00", "Used · asking price"],
  ];
  return (
    <figure className="lp-receipt" aria-labelledby="lp-receipt-caption">
      <div className="lp-receipt-shadow">
        <div className="lp-receipt-paper">
          <p className="lp-r-title">Ceval · price check</p>
          <p className="lp-r-item">
            Wireless headphones
            <br />
            Over-ear, black
          </p>
          <div className="lp-r-row">
            <span>Shelf label</span>
            <i className="lp-r-dots" />
            <span>$249.00</span>
          </div>
          <hr className="lp-r-rule" />
          {offers.map(([source, price, detail]) => (
            <div key={price} className="lp-r-offer">
              <div className="lp-r-row">
                <span>
                  {source} <ArrowUpRight aria-hidden="true" />
                </span>
                <i className="lp-r-dots" />
                <span>${price}</span>
              </div>
              <p className="lp-r-meta">{detail}</p>
            </div>
          ))}
          <hr className="lp-r-rule" />
          <div className="lp-r-row lp-r-total">
            <span>Lowest new price</span>
            <i className="lp-r-dots" />
            <span>$219.00</span>
          </div>
          <p className="lp-r-meta">Checked 14:02</p>
        </div>
      </div>
      <figcaption id="lp-receipt-caption">An example price check.</figcaption>
    </figure>
  );
}

const steps: [string, string][] = [
  [
    "Point at the product",
    "Open Ceval in your phone’s browser and aim at the item and its price tag. You can also choose a video you’ve already shot.",
  ],
  [
    "Confirm the model",
    "Ceval reads the packaging and the label. When two models look alike, it asks you to choose instead of guessing.",
  ],
  [
    "Compare prices",
    "Offers from retailers and marketplaces appear with their source, condition and the time they were checked.",
  ],
];

const finePrint: [string, string][] = [
  ["Where it works", "In your phone’s browser. There’s no app to install."],
  [
    "What it reads best",
    "Electronics and boxed products with a visible model name or number.",
  ],
  ["Markets", "United States, United Kingdom and Türkiye, in local currency."],
  ["Camera or video", "Scan live, or choose a video up to 10 minutes long."],
  ["Camera access", "Ceval asks for the camera only when you tap to start."],
  [
    "What leaves your phone",
    "Selected frames, sent to Meta’s Muse Spark model to recognize products and search prices. Your full video stays on your device.",
  ],
  [
    "What’s saved",
    "Your recent finds and small product photos, in your account. Delete one or all at any time.",
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
  return (
    <div className="lp">
      <a className="lp-skip" href="#lp-main">
        Skip to content
      </a>
      <header className="lp-top" data-scrolled={scrolled}>
        <div className="lp-wrap lp-top-inner">
          <Brand />
          <nav aria-label="Main navigation">
            <a className="lp-top-link lp-top-optional" href="#how">
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
                same model online and secondhand, and shows every price with its
                source.
              </p>
              <div className="lp-hero-actions">
                <a className="lp-btn lp-btn-ink" href="/app">
                  Open Ceval
                </a>
                <a className="lp-link" href="#how">
                  How it works <ArrowDown aria-hidden="true" />
                </a>
              </div>
              <p className="lp-hero-note">
                Works in your phone’s browser. Nothing to install.
              </p>
            </div>
            <figure className="lp-hero-shot">
              <div className="lp-shot-frame">
                <img
                  src="/campaign/v4/hero-shelf-960.jpg"
                  srcSet="/campaign/v4/hero-shelf-640.jpg 640w, /campaign/v4/hero-shelf-960.jpg 960w, /campaign/v4/hero-shelf-1280.jpg 1280w"
                  sizes="(max-width: 860px) 100vw, 520px"
                  width="1024"
                  height="1536"
                  fetchPriority="high"
                  decoding="async"
                  alt="Black headphones on a store shelf with an electronic price label."
                />
                <ShelfLabel />
              </div>
              <figcaption>
                <span className="lp-sr-only">
                  The shelf label reads $249.00. Ceval finds the same headphones
                  online from $219.00.
                </span>
                Illustration. Example prices.
              </figcaption>
            </figure>
          </div>
        </section>

        <section
          className="lp-section lp-how"
          id="how"
          aria-labelledby="how-title"
        >
          <div className="lp-wrap lp-how-grid">
            <div className="lp-how-copy">
              <h2 id="how-title">How a price check works</h2>
              <ol className="lp-steps">
                {steps.map(([title, text], index) => (
                  <li key={title}>
                    <span className="lp-step-n" aria-hidden="true">
                      {index + 1}
                    </span>
                    <div>
                      <h3>{title}</h3>
                      <p>{text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <PhoneExample />
          </div>
        </section>

        <section className="lp-section lp-modes" aria-labelledby="modes-title">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <h2 id="modes-title">Buying new, or buying used</h2>
              <p>
                Choose a mode before you scan, and Ceval looks for the answer
                that fits.
              </p>
            </div>
            <div className="lp-modes-grid">
              <article className="lp-mode">
                <div className="lp-mode-shot">
                  <img
                    src="/campaign/v2/electronics-960.jpg"
                    srcSet="/campaign/v2/electronics-640.jpg 640w, /campaign/v2/electronics-960.jpg 960w, /campaign/v2/electronics-1600.jpg 1600w"
                    sizes="(max-width: 860px) 100vw, 50vw"
                    loading="lazy"
                    decoding="async"
                    alt="Black over-ear headphones on a stand in an electronics store."
                  />
                  <div className="lp-mode-tag" aria-hidden="true">
                    <span>
                      <small>Shelf</small>
                      <b>$249</b>
                    </span>
                    <span className="is-ceval">
                      <small>Online from</small>
                      <b>$219</b>
                    </span>
                  </div>
                </div>
                <h3>Buy cheaper</h3>
                <p className="lp-mode-question">
                  Is it cheaper somewhere else?
                </p>
                <p>
                  Ceval compares the shelf price with current offers for the
                  same model from retailers and marketplaces.
                </p>
                <p className="lp-fine">
                  Item prices only. Shipping and tax aren’t included. Example
                  prices.
                </p>
              </article>
              <article className="lp-mode">
                <div className="lp-mode-shot">
                  <img
                    src="/campaign/v3/resale-camera-960.jpg"
                    srcSet="/campaign/v3/resale-camera-640.jpg 640w, /campaign/v3/resale-camera-960.jpg 960w, /campaign/v3/resale-camera-1536.jpg 1536w"
                    sizes="(max-width: 860px) 100vw, 50vw"
                    loading="lazy"
                    decoding="async"
                    alt="A vintage film camera on a wooden table at a sunlit flea market."
                  />
                  <div className="lp-mode-tag" aria-hidden="true">
                    <span>
                      <small>Market tag</small>
                      <b>$45</b>
                    </span>
                    <span className="is-ceval">
                      <small>Listed for</small>
                      <b>$95–140</b>
                    </span>
                  </div>
                </div>
                <h3>Resale value</h3>
                <p className="lp-mode-question">What’s it worth secondhand?</p>
                <p>
                  Ceval shows what similar used items are listed for on public
                  marketplaces. Useful at a flea market, or before you sell.
                </p>
                <p className="lp-fine">
                  These are asking prices, not completed sales. Example prices.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section
          className="lp-section lp-sources"
          aria-labelledby="sources-title"
        >
          <div className="lp-wrap lp-sources-grid">
            <div className="lp-sources-copy">
              <h2 id="sources-title">Every number has a source</h2>
              <p className="lp-sources-lede">
                Ceval only shows prices it can link to a page. When it can’t
                find one, it says so instead of filling the gap.
              </p>
              <ul className="lp-rules">
                <li>
                  Each price links to the page it came from, with the time it
                  was checked.
                </li>
                <li>
                  A result is an exact match only when the model and variant
                  agree. Otherwise it’s marked as possible.
                </li>
                <li>
                  Asking prices are labeled as asking. A listing is never
                  presented as a sale.
                </li>
              </ul>
            </div>
            <Receipt />
          </div>
        </section>

        <section
          className="lp-section lp-fineprint"
          id="fine-print"
          aria-labelledby="fine-print-title"
        >
          <div className="lp-wrap lp-fp-grid">
            <h2 id="fine-print-title">The fine print</h2>
            <dl className="lp-fp-list">
              {finePrint.map(([term, detail]) => (
                <div key={term}>
                  <dt>{term}</dt>
                  <dd>{detail}</dd>
                </div>
              ))}
            </dl>
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
          className="lp-section lp-closing"
          aria-labelledby="closing-title"
        >
          <div className="lp-wrap lp-closing-grid">
            <div>
              <h2 id="closing-title">Try it on the next price tag you see.</h2>
              <a className="lp-btn lp-btn-ink" href="/app">
                Open Ceval
              </a>
            </div>
            <div className="lp-qr">
              <div className="lp-qr-screen">
                <img
                  src="/campaign/v3/open-app-qr.svg"
                  width="136"
                  height="136"
                  loading="lazy"
                  alt="QR code that opens Ceval"
                />
                <p>Scan with your phone’s camera to open Ceval.</p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-inner">
          <Brand />
          <nav aria-label="Footer navigation">
            <a href="#how">How it works</a>
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
