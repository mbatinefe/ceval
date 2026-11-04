import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  ScanLine,
  Search,
} from "lucide-react";
import { Brand } from "../components/Brand";
import { useThemeColor } from "../lib/theme-color";
import { FindPhoto, ThriftStory } from "../landing/ThriftStory";
import { wideFinds } from "../landing/thrift-demo";
import "../styles/landing.css";
import "../styles/cinematic.css";

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

export function Landing() {
  useThemeColor("#111310");
  return (
    <div className="cinema-home">
      <a className="cinema-skip" href="#cinema-main">
        Skip to content
      </a>
      <header className="cinema-nav">
        <Brand />
        <nav aria-label="Main navigation">
          <a className="cinema-how-link" href="#how">
            How it works
          </a>
          <a className="cinema-cta" href="/app">
            Open Ceval <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        </nav>
      </header>
      <main id="cinema-main">
        <ThriftStory />
        <section
          className="cinema-beyond"
          id="beyond"
          aria-labelledby="beyond-title"
        >
          <div className="cinema-section-heading">
            <p className="cinema-overline">THE WORLD IS FULL OF FINDS</p>
            <h2 id="beyond-title">
              Go where your
              <br />
              <span>curiosity takes you.</span>
            </h2>
            <p>From a shop around the corner to something you already own.</p>
          </div>
          <div className="cinema-editorial">
            <img
              src="/campaign/thrift/discovery-table.webp"
              width={1672}
              height={941}
              loading="lazy"
              decoding="async"
              alt="A vintage camera, red lamp, radio, records, boots and ceramic bowl on a worn thrift-store table."
            />
            <div className="cinema-editorial-gradient" />
            <div className="cinema-editorial-caption">
              <span className="cinema-overline">
                ONE MORE REASON TO LOOK AROUND
              </span>
              <p>
                There’s more
                <br />
                than meets the eye.
              </p>
            </div>
            <div className="cinema-saved-card">
              <span>
                <Bookmark size={16} aria-hidden="true" /> A few good finds
              </span>
              {[wideFinds[0], wideFinds[5], wideFinds[1]].map((find) => (
                <div className="cinema-saved-row" key={find.id}>
                  <FindPhoto find={find} />
                  <div>
                    <b>{find.name}</b>
                    <small>Photo, details, possibilities.</small>
                  </div>
                  <span aria-hidden="true">↗</span>
                </div>
              ))}
              <small className="cinema-saved-note">
                Illustrative collection
              </small>
            </div>
          </div>
          <div className="cinema-benefits">
            <article>
              <ScanLine aria-hidden="true" size={22} />
              <h3>Look closer.</h3>
              <p>Find the name behind the thing that caught your eye.</p>
            </article>
            <article>
              <Search aria-hidden="true" size={22} />
              <h3>Compare your options.</h3>
              <p>Explore online offers and similar secondhand listings.</p>
            </article>
            <article>
              <Bookmark aria-hidden="true" size={22} />
              <h3>Keep the good ones.</h3>
              <p>Your finds, with photos and details, ready to revisit.</p>
            </article>
          </div>
        </section>
        <section
          className="cinema-faq"
          id="questions"
          aria-labelledby="questions-title"
        >
          <h2 id="questions-title">Good to know.</h2>
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
        </section>
        <section className="cinema-finale" aria-labelledby="finale-title">
          <p className="cinema-overline">TAKE A SECOND LOOK</p>
          <h2 id="finale-title">
            Your next find
            <br />
            is out there.
          </h2>
          <a className="cinema-cta" href="/app">
            Open Ceval <ArrowRight size={18} aria-hidden="true" />
          </a>
          <p>Right in your phone’s browser.</p>
        </section>
      </main>
      <footer className="cinema-footer">
        <Brand />
        <p>Made for the curious.</p>
        <nav aria-label="Footer navigation">
          <a href="#questions">How it works</a>
          <a href="/signin">Sign in</a>
        </nav>
        <small>
          AI-generated scenes and illustrative prices. Store links open
          searches, not verified offers.
        </small>
      </footer>
    </div>
  );
}
