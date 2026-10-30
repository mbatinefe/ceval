import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Camera,
  ScanLine,
  Video,
} from "lucide-react";
import { Brand } from "../components/Brand";
import "../styles/landing.css";

const staticQuery = "(prefers-reduced-motion: reduce), (max-height: 649px)";
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const ease = (value: number) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};

function useCampaignMotion(root: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const page = root.current;
    if (!page) return;
    const preference = window.matchMedia(staticQuery);
    const sequence = page.querySelector<HTMLElement>(".lens-sequence")!;
    const stage = page.querySelector<HTMLElement>(".lens-stage")!;
    const drifting = [...page.querySelectorAll<HTMLElement>("[data-drift]")];
    const entering = [...page.querySelectorAll<HTMLElement>("[data-enter]")];
    let frame = 0;
    const paint = () => {
      frame = 0;
      if (page.dataset.motion === "false") return;
      const rect = sequence.getBoundingClientRect();
      const progress = clamp(
        -rect.top / Math.max(1, sequence.offsetHeight - stage.offsetHeight),
      );
      sequence.style.setProperty(
        "--lens-scale",
        String(1 + ease(progress / 0.65) * 1.5),
      );
      sequence.style.setProperty(
        "--aperture",
        `${ease((progress - 0.25) / 0.45) * 140}%`,
      );
      sequence.style.setProperty(
        "--intro-opacity",
        String(1 - ease((progress - 0.12) / 0.2)),
      );
      sequence.style.setProperty(
        "--result-opacity",
        String(ease((progress - 0.67) / 0.16)),
      );
      sequence.style.setProperty(
        "--result-y",
        `${(1 - ease((progress - 0.67) / 0.16)) * 28}px`,
      );
      sequence.dataset.revealed = String(progress >= 0.67);
      for (const element of drifting) {
        const bounds = element.getBoundingClientRect();
        if (bounds.bottom < 0 || bounds.top > innerHeight) continue;
        const position = clamp(
          (innerHeight - bounds.top) / (innerHeight + bounds.height),
        );
        element.style.setProperty("--drift", `${(position - 0.5) * 38}px`);
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const changePreference = () => {
      const expandedType = parseFloat(getComputedStyle(page).fontSize) > 20;
      const staticLayout = preference.matches || expandedType;
      page.dataset.expandedType = String(expandedType);
      page.dataset.motion = String(!staticLayout);
      if (staticLayout) {
        for (const element of entering) element.dataset.entered = "true";
        sequence.dataset.revealed = "true";
      } else schedule();
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).dataset.entered = "true";
            observer.unobserve(entry.target);
          }
      },
      { threshold: 0.12 },
    );
    entering.forEach((element) => observer.observe(element));
    const resize = new ResizeObserver(changePreference);
    resize.observe(sequence);
    resize.observe(stage);
    resize.observe(page.querySelector<HTMLElement>(".hero-editorial")!);
    preference.addEventListener("change", changePreference);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    changePreference();
    paint();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      resize.disconnect();
      preference.removeEventListener("change", changePreference);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      delete page.dataset.motion;
      delete page.dataset.expandedType;
    };
  }, [root]);
}

function Photo({
  name,
  portrait,
  alt,
  priority = false,
  eager = false,
  className = "",
  sizes = "100vw",
}: {
  name: string;
  portrait?: string;
  alt: string;
  priority?: boolean;
  eager?: boolean;
  className?: string;
  sizes?: string;
}) {
  return (
    <picture className={`campaign-photo ${className}`}>
      {portrait && (
        <source
          media="(max-width: 700px)"
          srcSet={`/campaign/v2/${portrait}-640.jpg 640w, /campaign/v2/${portrait}-960.jpg 960w`}
          sizes="100vw"
        />
      )}
      <img
        src={`/campaign/v2/${name}-1600.jpg`}
        srcSet={`/campaign/v2/${name}-640.jpg 640w, /campaign/v2/${name}-960.jpg 960w, /campaign/v2/${name}-1600.jpg 1600w`}
        sizes={sizes}
        width="1600"
        height="900"
        loading={priority || eager ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        alt={alt}
      />
    </picture>
  );
}

function AppLink({
  children = "Try Ceval",
  light = false,
}: {
  children?: React.ReactNode;
  light?: boolean;
}) {
  return (
    <a className={`campaign-cta${light ? " cta-light" : ""}`} href="/app">
      {children}
      <ArrowUpRight size={18} />
    </a>
  );
}

const discoveries = [
  {
    image: "jacket-detail",
    title: "A new favorite.",
    category: "Fashion",
    alt: "An olive wool jacket photographed on a warm ivory studio background.",
  },
  {
    image: "record-store",
    title: "An old obsession.",
    category: "Collectibles",
    alt: "Hands discovering a vintage record in a sunlit record store.",
  },
  {
    image: "sneaker-detail",
    title: "The perfect pair.",
    category: "Everyday finds",
    alt: "An off-white and forest-green suede sneaker in a studio.",
  },
  {
    image: "ceramic-detail",
    title: "Something unexpected.",
    category: "Home & design",
    alt: "A sculptural cream stoneware vase with a sunlit shadow.",
  },
];

export function Landing() {
  const root = useRef<HTMLDivElement>(null);
  useCampaignMotion(root);
  return (
    <div className="campaign" ref={root}>
      <a className="campaign-skip" href="#phone">
        Skip to the phone app
      </a>
      <header className="campaign-header">
        <Brand />
        <nav aria-label="Main navigation">
          <a className="campaign-nav-explore" href="#experience">
            Explore
          </a>
          <a href="/signin">Sign in</a>
          <AppLink>Open app</AppLink>
        </nav>
      </header>
      <main>
        <section className="campaign-hero" aria-labelledby="landing-title">
          <div className="hero-image" data-drift>
            <Photo
              name="city-wearer"
              portrait="city-wearer-portrait"
              priority
              alt="A woman in smart glasses looking into a city shop window at blue hour. Concept photograph."
            />
          </div>
          <div className="hero-shade" />
          <div className="hero-editorial">
            <span className="campaign-kicker">A new perspective</span>
            <h1 id="landing-title">
              See more.
              <br />
              <span>Spend less.</span>
            </h1>
            <p>
              Compare online prices.
              <br />
              Discover resale potential.
            </p>
            <AppLink />
          </div>
          <div className="hero-bottom">
            <a href="#experience">
              <ArrowDown size={16} />
              Keep looking
            </a>
            <span>Phone preview available · Glasses concept</span>
          </div>
        </section>

        <section
          className="lens-sequence"
          id="experience"
          aria-label="From your perspective to a price comparison"
        >
          <div className="lens-stage">
            <div className="lens-opening">
              <Photo
                name="glasses-object"
                eager
                alt="Black camera glasses in a studio, with a boutique reflected in their lenses. Product concept."
              />
              <div className="lens-heading">
                <span className="campaign-kicker">Glasses concept</span>
                <h2>
                  Look a little
                  <br />
                  closer.
                </h2>
              </div>
              <span className="lens-note">Glasses experience · Concept</span>
            </div>
            <div className="lens-world">
              <Photo
                name="fashion-store"
                eager
                alt="An olive wool jacket on a clothing rail in a limestone fashion boutique."
              />
              <div className="lens-world-shade" />
              <div className="fashion-copy">
                <span className="campaign-kicker">Compare prices</span>
                <h2>
                  Good taste.
                  <br />
                  <span>Better price.</span>
                </h2>
                <p>
                  See how the price in store
                  <br />
                  compares with offers online.
                </p>
              </div>
              <div className="fashion-result">
                <div className="result-identifier">
                  <ScanLine size={16} />
                  <span>Wool jacket</span>
                  <small>Example</small>
                </div>
                <div className="fashion-prices">
                  <div>
                    <span>In store</span>
                    <strong>€89.95</strong>
                  </div>
                  <ArrowRight size={19} />
                  <div>
                    <span>Online offer</span>
                    <strong>€69.95</strong>
                  </div>
                </div>
                <div className="result-foot">
                  <span>A €20 difference.</span>
                  <span>Illustrative prices</span>
                </div>
              </div>
            </div>
            <div className="lens-progress" aria-hidden="true">
              <span>Look</span>
              <i />
              <span>Discover</span>
            </div>
          </div>
        </section>

        <section
          className="electronics-section campaign-wrap"
          id="compare"
          aria-labelledby="electronics-title"
        >
          <div className="section-intro" data-enter>
            <span className="campaign-kicker">Compare offers</span>
            <h2 id="electronics-title">
              Your next upgrade.
              <br />
              <span>At a better price.</span>
            </h2>
          </div>
          <div className="electronics-layout">
            <div className="electronics-image" data-drift>
              <Photo
                name="electronics"
                sizes="(max-width: 700px) 100vw, 65vw"
                alt="Matte-black headphones on a brushed aluminum stand in a modern electronics shop."
              />
              <span className="photo-caption">
                From your favorite store to the wider web.
              </span>
            </div>
            <div className="electronics-info" data-enter>
              <ScanLine size={24} strokeWidth={1.3} />
              <h3>
                Wireless
                <br />
                headphones.
              </h3>
              <p>Store and online offers, side by side.</p>
              <div className="offer-row">
                <span>In store</span>
                <strong>$249</strong>
              </div>
              <div className="offer-row offer-best">
                <span>Online offer</span>
                <strong>
                  $219
                  <ArrowUpRight size={18} />
                </strong>
              </div>
              <small>Illustrative comparison. Not live offers.</small>
              <a className="campaign-text-link" href="/app">
                Explore the phone preview <ArrowRight size={16} />
              </a>
            </div>
          </div>
        </section>

        <section
          className="resale-section"
          id="resale"
          aria-labelledby="resale-title"
        >
          <div className="resale-image" data-drift>
            <Photo
              name="chair-market"
              alt="A bentwood leather lounge chair at a sunlit vintage furniture market."
            />
          </div>
          <div className="resale-shade" />
          <div className="resale-editorial" data-enter>
            <span className="campaign-kicker">Explore resale</span>
            <h2 id="resale-title">
              An eye for
              <br />
              <span>possibility.</span>
            </h2>
            <p>
              Find out what similar pieces are listed for.
              <br />
              See a little more in your next discovery.
            </p>
          </div>
          <div className="resale-value" data-enter>
            <div>
              <span>At the market</span>
              <strong>€45</strong>
            </div>
            <ArrowRight size={22} />
            <div>
              <span>Similar asking prices</span>
              <strong>€95–140</strong>
            </div>
            <p>
              Illustrative prices. Asking prices are not completed sales.
              <br />
              Condition, fees and demand affect value.
            </p>
          </div>
        </section>

        <section
          className="discoveries-section"
          aria-labelledby="discoveries-title"
        >
          <div className="discoveries-heading campaign-wrap" data-enter>
            <h2 id="discoveries-title">Follow your eye.</h2>
            <p>There’s a whole world worth a second look.</p>
          </div>
          <div
            className="discoveries-grid"
            tabIndex={0}
            role="region"
            aria-label="Shopping inspiration: fashion, collectibles, shoes and home design"
          >
            {discoveries.map(({ image, title, category, alt }, index) => (
              <figure
                className={`discovery discovery-${index}`}
                key={image}
                data-enter
              >
                <Photo
                  name={image}
                  sizes="(max-width: 700px) 78vw, 25vw"
                  alt={alt}
                />
                <figcaption>
                  <span>{category}</span>
                  <h3>{title}</h3>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section
          className="phone-section"
          id="phone"
          tabIndex={-1}
          aria-labelledby="phone-title"
        >
          <div className="phone-image" data-drift>
            <Photo
              name="phone-fashion"
              portrait="phone-fashion-portrait"
              alt="A phone camera pointed at an olive jacket in a fashion boutique. Concept image."
            />
          </div>
          <div className="phone-shade" />
          <div className="phone-editorial" data-enter>
            <span className="campaign-kicker">On your phone</span>
            <h2 id="phone-title">
              A new outlook.
              <br />
              <span>On your phone.</span>
            </h2>
            <p>
              Open your camera or choose a video.
              <br />
              Ceval starts in your browser.
            </p>
            <AppLink>Try the phone preview</AppLink>
            <div className="phone-inputs">
              <span>
                <Camera size={16} />
                Camera
              </span>
              <span>
                <Video size={16} />
                Video upload
              </span>
            </div>
            <small>Camera and video scanning. Prices linked to sources.</small>
          </div>
        </section>
      </main>
      <footer className="campaign-footer">
        <div className="footer-top">
          <Brand />
          <a href="/app">
            Take a closer look <ArrowUpRight size={16} />
          </a>
        </div>
        <div className="footer-bottom">
          <span>See more in the everyday.</span>
          <p>
            Generated concept imagery. Glasses integration is a concept.
            <br />
            Prices shown are illustrative. Phone web app in preview.
          </p>
          <a href="/signin">Sign in</a>
        </div>
      </footer>
    </div>
  );
}
