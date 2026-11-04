import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Brand } from "../components/Brand";
import { useThemeColor } from "../lib/theme-color";
import { ThriftStory } from "../landing/ThriftStory";
import { Everywhere } from "../landing/Everywhere";
import { SavedFinds } from "../landing/SavedFinds";
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

// The header stays clear over the opening photo and turns solid once the
// page starts moving, so it never sits on top of headings or cards.
function useSolidHeader() {
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      setSolid(window.scrollY > window.innerHeight * 0.3);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
    };
  }, []);
  return solid;
}

export function Landing() {
  useThemeColor("#14110e");
  const solid = useSolidHeader();
  return (
    <div className="cinema-home">
      <a className="cinema-skip" href="#cinema-main">
        Skip to content
      </a>
      <header className="cinema-nav" data-solid={solid}>
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
        <Everywhere />
        <SavedFinds />
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
          <h2 id="finale-title">Try it on the next thing you pick up.</h2>
          <a className="cinema-cta" href="/app">
            Open Ceval <ArrowRight size={18} aria-hidden="true" />
          </a>
          <p>Works in your phone’s browser. Nothing to install.</p>
        </section>
      </main>
      <footer className="cinema-footer">
        <Brand />
        <nav aria-label="Footer navigation">
          <a href="#how">How it works</a>
          <a href="#questions">Questions</a>
          <a href="/signin">Sign in</a>
        </nav>
      </footer>
    </div>
  );
}
