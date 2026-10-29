import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  ScanLine,
  Smartphone,
  Video,
} from "lucide-react";
import { Brand } from "../components/Brand";
import "../styles/landing.css";

const chapters = [
  "Discover",
  "Look closer",
  "Buy better",
  "Explore resale",
  "Your phone",
];
const timelineLength = 4.6;
const staticStoryQuery =
  "(prefers-reduced-motion: reduce), (max-height: 649px)";
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const ease = (value: number) => {
  const progress = clamp(value);
  return progress * progress * (3 - 2 * progress);
};

function useScrollStory(story: RefObject<HTMLDivElement | null>) {
  const [active, setActive] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia(staticStoryQuery).matches,
  );
  useEffect(() => {
    const preference = window.matchMedia(staticStoryQuery);
    const change = () => setReducedMotion(preference.matches);
    preference.addEventListener("change", change);
    return () => preference.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    const element = story.current;
    if (!element || reducedMotion) return;
    const stage = element.querySelector<HTMLElement>(".story-stage")!;
    const scenes = [...element.querySelectorAll<HTMLElement>(".story-scene")];
    let frame = 0;
    let previous = -1;
    const paint = () => {
      frame = 0;
      const distance = element.offsetHeight - stage.offsetHeight;
      const progress = clamp(
        -element.getBoundingClientRect().top / Math.max(1, distance),
      );
      const time = progress * timelineLength;
      const current = Math.min(chapters.length - 1, Math.floor(time + 0.17));
      element.style.setProperty("--story-progress", `${progress * 100}%`);
      for (const [index, scene] of scenes.entries()) {
        const local = time - index;
        const enter = index === 0 ? 1 : ease((local + 0.34) / 0.34);
        const leave =
          index === scenes.length - 1 ? 1 : 1 - ease((local - 0.66) / 0.34);
        const opacity = enter * leave;
        scene.style.setProperty("--scene-opacity", String(opacity));
        scene.style.setProperty(
          "--photo-scale",
          String(
            1 + clamp((local + 0.34) / 1.34) * (index === 1 ? 0.2 : 0.085),
          ),
        );
        scene.style.setProperty(
          "--copy-y",
          `${(1 - enter) * 24 - (1 - leave) * 24}px`,
        );
        scene.style.visibility = opacity > 0 ? "visible" : "hidden";
      }
      if (current !== previous) {
        previous = current;
        setActive(current);
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    observer.observe(stage);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    paint();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      for (const scene of scenes) {
        scene.style.removeProperty("--scene-opacity");
        scene.style.removeProperty("--photo-scale");
        scene.style.removeProperty("--copy-y");
        scene.style.removeProperty("visibility");
      }
    };
  }, [story, reducedMotion]);
  const goTo = (index: number) => {
    const element = story.current;
    if (!element) return;
    const scenes = element.querySelectorAll<HTMLElement>(".story-scene");
    if (reducedMotion) {
      scenes[index]?.scrollIntoView({ block: "start", behavior: "instant" });
      scenes[index]?.focus({ preventScroll: true });
      return;
    }
    const stage = element.querySelector<HTMLElement>(".story-stage")!;
    const top = window.scrollY + element.getBoundingClientRect().top;
    window.scrollTo({
      top:
        top +
        (index / timelineLength) * (element.offsetHeight - stage.offsetHeight),
      behavior: "instant",
    });
    element
      .querySelectorAll<HTMLButtonElement>(".story-chapters button")
      [index]?.focus({ preventScroll: true });
  };
  return { active, reducedMotion, goTo };
}

function CampaignPhoto({
  name,
  portrait,
  alt,
  priority = false,
}: {
  name: string;
  portrait?: string;
  alt: string;
  priority?: boolean;
}) {
  return (
    <picture className="story-photo">
      {portrait && (
        <source
          media="(max-width: 700px)"
          srcSet={`/campaign/${portrait}-640.jpg 640w, /campaign/${portrait}-960.jpg 960w`}
          sizes="100vw"
        />
      )}
      <img
        src={`/campaign/${name}-1600.jpg`}
        srcSet={`/campaign/${name}-960.jpg 960w, /campaign/${name}-1600.jpg 1600w`}
        sizes="100vw"
        width="1600"
        height="900"
        fetchPriority={priority ? "high" : "low"}
        loading="eager"
        decoding="async"
        alt={alt}
      />
    </picture>
  );
}

function PriceCard({ resale = false }: { resale?: boolean }) {
  return (
    <div className="story-price-card">
      <div className="price-card-top">
        <ScanLine size={16} />
        <span>Canon EOS 80D</span>
        <span className="price-example">EXAMPLE</span>
      </div>
      <div className="price-card-values">
        <div>
          <span>In store</span>
          <strong>$349</strong>
        </div>
        <ArrowRight size={18} />
        <div>
          <span>{resale ? "Resale asking price" : "Online offer"}</span>
          <strong className="price-highlight">
            {resale ? "$379" : "$329"}
          </strong>
        </div>
      </div>
      <div className="price-card-bottom">
        <span>
          {resale ? "Asking price ≠ sold price" : "Same model. $20 less."}
        </span>
        <span>Body only · Used</span>
      </div>
    </div>
  );
}

export function Landing() {
  const story = useRef<HTMLDivElement>(null);
  const { active, reducedMotion, goTo } = useScrollStory(story);
  const sceneProps = (index: number) => ({
    tabIndex: -1,
    "aria-hidden": reducedMotion ? undefined : active !== index,
    inert: !reducedMotion && active !== index,
    "data-active": active === index,
  });
  return (
    <div className="cinematic" data-reduced-motion={reducedMotion}>
      <a className="story-skip" href="#start">
        Skip to the phone app
      </a>
      <header className="site-header story-header">
        <Brand />
        <nav aria-label="Main navigation">
          <button className="story-header-explore" onClick={() => goTo(1)}>
            The experience
          </button>
          <a className="quiet-link" href="/signin">
            Sign in
          </a>
          <a className="button primary small" href="/app">
            Open app <ArrowUpRight size={15} />
          </a>
        </nav>
      </header>
      <main>
        <div className="scroll-story" ref={story} data-active-chapter={active}>
          <div className="story-stage">
            <section
              className="story-scene story-discover"
              aria-labelledby="landing-title"
              {...sceneProps(0)}
            >
              <CampaignPhoto
                name="hero"
                portrait="portrait"
                priority
                alt="A shopper in smart glasses looking through a warmly lit camera shop. Concept photograph."
              />
              <div className="story-shade" />
              <div className="story-copy">
                <span className="story-eyebrow">A NEW WAY TO LOOK</span>
                <h1 id="landing-title">
                  See what
                  <br />
                  it’s worth.
                </h1>
                <p>
                  Find a better price.
                  <br />
                  Spot your next great find.
                </p>
                <a className="story-cta" href="/app">
                  Try Ceval <ArrowUpRight size={18} />
                </a>
              </div>
              <button className="story-scroll-cue" onClick={() => goTo(1)}>
                <ArrowDown size={16} />
                <span>Scroll to explore</span>
              </button>
              <span className="story-caption">
                Glasses experience · Concept
              </span>
            </section>
            <section
              className="story-scene story-look"
              aria-labelledby="look-title"
              {...sceneProps(1)}
            >
              <CampaignPhoto
                name="detail"
                alt="Close-up of smart glasses with the camera shop reflected in the lens. Concept photograph."
              />
              <div className="story-shade" />
              <div className="story-copy">
                <span className="story-eyebrow">
                  01 / A DIFFERENT PERSPECTIVE
                </span>
                <h2 id="look-title">
                  More than
                  <br />
                  meets the eye.
                </h2>
                <p>
                  A price tag is only
                  <br />
                  part of the picture.
                </p>
              </div>
              <span className="story-caption">
                Glasses experience · Concept
              </span>
            </section>
            <section
              className="story-scene story-compare"
              aria-labelledby="buy-title"
              {...sceneProps(2)}
            >
              <CampaignPhoto
                name="perspective"
                portrait="perspective-portrait"
                alt="A Canon EOS 80D camera on an oak shelf, with an illustrative $349 price tag."
              />
              <div className="story-shade" />
              <div className="story-focus" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
                <span>
                  <span className="story-dot" />
                  Canon EOS 80D
                </span>
              </div>
              <div className="story-copy">
                <span className="story-eyebrow">02 / BUY BETTER</span>
                <h2 id="buy-title">
                  Love the find.
                  <br />
                  <span>Check the price.</span>
                </h2>
                <p>
                  Compare what’s in front of you
                  <br />
                  with offers online.
                </p>
              </div>
              <PriceCard />
              <span className="story-caption">
                Illustrative comparison · Not live offers
              </span>
            </section>
            <section
              className="story-scene story-resale"
              aria-labelledby="resale-title"
              {...sceneProps(3)}
            >
              <CampaignPhoto
                name="perspective"
                portrait="perspective-portrait"
                alt="The same Canon camera, now compared with an example resale listing."
              />
              <div className="story-shade" />
              <div className="story-focus" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
                <span>
                  <span className="story-dot" />
                  Canon EOS 80D
                </span>
              </div>
              <div className="story-copy">
                <span className="story-eyebrow">03 / EXPLORE RESALE</span>
                <h2 id="resale-title">
                  A good find.
                  <br />
                  <span>A second life.</span>
                </h2>
                <p>
                  See what similar items are listed for.
                  <br />
                  Know more before you buy.
                </p>
              </div>
              <PriceCard resale />
              <span className="story-caption">
                Illustrative asking prices · Fees and condition affect value
              </span>
            </section>
            <section
              className="story-scene story-phone"
              aria-labelledby="phone-title"
              {...sceneProps(4)}
            >
              <CampaignPhoto
                name="phone"
                portrait="phone-portrait"
                alt="A hand holding an iPhone toward the same camera shelf, with the camera visible on its screen. Concept photograph."
              />
              <div className="story-shade" />
              <div className="story-copy">
                <span className="story-eyebrow">04 / ALREADY IN YOUR HAND</span>
                <h2 id="phone-title">
                  Your phone.
                  <br />A new lens.
                </h2>
                <p>
                  Open your camera. Or bring a video.
                  <br />
                  Start in your browser.
                </p>
                <a className="story-cta" href="/app">
                  Try the phone preview <ArrowUpRight size={18} />
                </a>
                <div className="story-inputs">
                  <span>
                    <Smartphone size={14} />
                    Camera
                  </span>
                  <span>
                    <Video size={15} />
                    Video upload
                  </span>
                </div>
              </div>
              <span className="story-caption">
                Phone preview · Live comparisons coming soon
              </span>
            </section>
            <nav
              className="story-chapters"
              aria-label="Explore the Ceval experience"
            >
              <div className="story-chapter-track" aria-hidden="true">
                <span />
              </div>
              {chapters.map((chapter, index) => (
                <button
                  key={chapter}
                  onClick={() => goTo(index)}
                  aria-current={active === index ? "step" : undefined}
                  aria-label={`${index + 1}. ${chapter}`}
                >
                  <span className="chapter-number">0{index + 1}</span>
                  <span className="chapter-name">{chapter}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>
        <section
          className="story-start"
          id="start"
          aria-labelledby="start-title"
        >
          <span className="story-eyebrow">LOOK A LITTLE CLOSER.</span>
          <h2 id="start-title">
            Good finds
            <br />
            start with a glance.
          </h2>
          <a className="story-cta" href="/app">
            Open Ceval <ArrowUpRight size={18} />
          </a>
          <p>Phone web app in preview. Live price search coming soon.</p>
        </section>
      </main>
      <footer className="story-footer">
        <Brand />
        <p>
          Generated imagery. Glasses shown as a concept.
          <br />
          Example prices are illustrative.
        </p>
        <a href="/signin">
          Sign in <ArrowUpRight size={14} />
        </a>
      </footer>
    </div>
  );
}
