import { useEffect, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight } from "lucide-react";
import { Brand } from "../components/Brand";
import { useThemeColor } from "../lib/theme-color";
import {
  campaignPrice,
  campaignReferencePrice,
} from "../../shared/campaign-listings";
import { ExampleResult } from "../landing/ExampleResult";
import { places } from "../landing/places";
import "../styles/home.css";

const steps = [
  {
    visual: "scan",
    title: "Point your camera",
    text: "Open Ceval in your phone’s browser and point it at a product, a label or a whole shelf. You can also choose a video.",
  },
  {
    visual: "name",
    title: "Ceval names it",
    text: "Meta’s Muse Spark reads labels and visual clues to find the exact model. When it isn’t sure, it says so.",
  },
  {
    visual: "prices",
    title: "Compare prices",
    text: "See new and used prices from real stores, each linked to its source, plus searches on Facebook Marketplace, eBay and Etsy.",
  },
] as const;

const promises = [
  [
    "Every price has a source",
    "Each price links to the page it came from, so you can check it yourself.",
  ],
  [
    "Asking isn’t sold",
    "Asking prices are shown as asking prices, never as completed sales.",
  ],
  [
    "Your video stays with you",
    "Only selected frames are sent for recognition. Your full video stays on your phone.",
  ],
  [
    "Keep what you find",
    "Finds are saved with their photos, prices and links. Delete any of them whenever you like.",
  ],
];

const questions = [
  [
    "Do I need to download an app?",
    "No. Open Ceval in your phone’s browser, allow the camera, and start exploring. You can also choose a video up to 10 minutes long.",
  ],
  [
    "What if there’s no label?",
    "Ceval looks for visual clues and similar products. When the exact model or variant is uncertain, it says so. A clearer label can help confirm the match.",
  ],
  [
    "What do the prices mean?",
    "Online offers and used asking prices, with links to their sources when available. Asking prices are not completed sales. Shipping, tax, condition and availability can change the comparison. Ceval does not always find a reliable price.",
  ],
  [
    "What happens to my camera footage?",
    "Selected frames go to Meta’s Muse Spark model for recognition and web search. Your full video stays on your device. Finds and small product photos are saved to your account; you can delete them at any time.",
  ],
];

const placeOrder = [
  "flea",
  "sneakers",
  "books",
  "tech",
  "furniture",
  "wardrobe",
];
const examples = [...places].sort(
  (a, b) => placeOrder.indexOf(a.id) - placeOrder.indexOf(b.id),
);

function useScrolled() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 8);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  return scrolled;
}

function StepVisual({ kind }: { kind: (typeof steps)[number]["visual"] }) {
  if (kind === "scan")
    return (
      <div className="viz-scan" aria-hidden="true">
        <i />
      </div>
    );
  if (kind === "name")
    return (
      <div className="viz-card viz-name" aria-hidden="true">
        <span>Nikon</span>
        <b>FM2</b>
        <em>Model match</em>
      </div>
    );
  return (
    <div className="viz-card viz-prices" aria-hidden="true">
      <p>
        <span>KEH</span>
        <b>$555</b>
      </p>
      <p>
        <span>MPB</span>
        <span>View listing</span>
      </p>
      <p className="viz-chips">
        <i>Marketplace</i>
        <i>eBay</i>
        <i>Etsy</i>
      </p>
    </div>
  );
}

export function Landing() {
  useThemeColor("#ffffff");
  const scrolled = useScrolled();
  return (
    <div className="home">
      <a className="home-skip" href="#main">
        Skip to content
      </a>
      <header className="home-nav" data-scrolled={scrolled}>
        <div className="home-wrap home-nav-inner">
          <Brand />
          <nav aria-label="Main navigation">
            <a className="home-nav-link" href="#how">
              How it works
            </a>
            <a className="home-nav-link" href="#questions">
              Questions
            </a>
            <a className="home-button" href="/app">
              Open Ceval
            </a>
          </nav>
        </div>
      </header>

      <main id="main">
        <section className="home-hero" aria-labelledby="hero-title">
          <div className="home-wrap home-hero-inner">
            <div>
              <p className="home-badge">
                <i aria-hidden="true" /> Powered by Meta’s Muse Spark
              </p>
              <h1 id="hero-title">
                Point your phone at anything. See what it’s worth.
              </h1>
              <p className="home-lead">
                Ceval names the exact product and finds it new and used at real
                stores, with a link to every price.
              </p>
              <div className="home-actions">
                <a className="home-button" href="/app">
                  Open Ceval <ArrowRight size={18} aria-hidden="true" />
                </a>
                <a className="home-text-link" href="#how">
                  See how it works <ArrowDown size={16} aria-hidden="true" />
                </a>
              </div>
              <p className="home-fine">
                Runs in your phone’s browser. Sign in with your email.
              </p>
            </div>
            <ExampleResult />
          </div>
        </section>

        <section
          className="home-section home-how"
          id="how"
          aria-labelledby="how-title"
        >
          <div className="home-wrap">
            <div className="home-section-head">
              <h2 id="how-title">How it works</h2>
              <p>From the shelf to a price you can check.</p>
            </div>
            <ol className="steps">
              {steps.map((step, index) => (
                <li className="step" key={step.title}>
                  <div className="step-visual">
                    <StepVisual kind={step.visual} />
                  </div>
                  <span className="step-number" aria-hidden="true">
                    {index + 1}
                  </span>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section
          className="home-section"
          id="anywhere"
          aria-labelledby="anywhere-title"
        >
          <div className="home-wrap">
            <div className="home-section-head">
              <h2 id="anywhere-title">Works wherever you shop</h2>
              <p>Real listings for things you might find, checked Nov 4.</p>
            </div>
            <ul className="places">
              {examples.map((place) => {
                const price =
                  campaignPrice(place.source) ??
                  campaignReferencePrice(place.source);
                return (
                  <li key={place.id}>
                    <a
                      className="place"
                      href={place.source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span className="place-where">{place.place}</span>
                      <span className="place-item">
                        {place.brand} {place.model}
                      </span>
                      <span className="place-price">
                        <strong>{price ?? "Check price"}</strong>
                        <span>{place.sourceLabel}</span>
                        <ArrowUpRight size={15} aria-hidden="true" />
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section
          className="home-section home-trust"
          aria-labelledby="trust-title"
        >
          <div className="home-wrap">
            <div className="home-section-head">
              <h2 id="trust-title">Prices you can check</h2>
              <p>Ceval shows where every number comes from.</p>
            </div>
            <ul className="promises">
              {promises.map(([title, text]) => (
                <li className="promise" key={title}>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section
          className="home-section"
          id="questions"
          aria-labelledby="questions-title"
        >
          <div className="home-wrap faq">
            <h2 id="questions-title">Questions</h2>
            <div>
              {questions.map(([question, answer]) => (
                <details key={question}>
                  <summary>
                    {question}
                    <span aria-hidden="true">+</span>
                  </summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="home-final" aria-labelledby="final-title">
          <div className="home-wrap">
            <h2 id="final-title">See what it’s worth.</h2>
            <p>
              Open Ceval on your phone and point it at the next thing you pick
              up.
            </p>
            <a className="home-button" href="/app">
              Open Ceval <ArrowRight size={18} aria-hidden="true" />
            </a>
          </div>
        </section>
      </main>

      <footer className="home-footer">
        <div className="home-wrap home-footer-inner">
          <Brand />
          <nav aria-label="Footer navigation">
            <a href="#how">How it works</a>
            <a href="#questions">Questions</a>
            <a href="/signin">Sign in</a>
          </nav>
          <small>
            Example prices come from public store listings checked Nov 4, 2026,
            and may have changed.
          </small>
        </div>
      </footer>
    </div>
  );
}
