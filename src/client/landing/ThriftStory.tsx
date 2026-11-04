import { useState, type CSSProperties } from "react";
import { ArrowDown, ArrowUpRight, ScanLine } from "lucide-react";
import facebookLogo from "../assets/facebook.png";
import {
  portraitFinds,
  sceneMedia,
  shoppingSearches,
  wideFinds,
  type ThriftFind,
} from "./thrift-demo";
import { PORTRAIT_QUERY, useStoryScroll } from "./useStoryScroll";

export function FindPhoto({
  find,
  portrait = false,
}: {
  find: ThriftFind;
  portrait?: boolean;
}) {
  const media = portrait ? sceneMedia.portrait : sceneMedia.wide;
  const { x, y, width, height } = find.box;
  return (
    <svg
      className="cinema-find-photo"
      viewBox={`${x * media.width} ${y * media.height} ${width * media.width} ${height * media.height}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <image href={media.src} width={media.width} height={media.height} />
    </svg>
  );
}

function ShoppingCard({
  find,
  portrait,
}: {
  find: ThriftFind;
  portrait: boolean;
}) {
  const links = shoppingSearches(find);
  return (
    <aside
      className="cinema-shopping"
      aria-label={`Shopping searches for ${find.name}`}
    >
      <div className="cinema-shopping-heading">
        <span className="cinema-product-photo">
          <FindPhoto find={find} portrait={portrait} />
        </span>
        <div>
          <span className="cinema-overline">A CLOSER LOOK</span>
          <h3>{find.name}</h3>
          <p>Compare similar finds</p>
        </div>
      </div>
      <div className="cinema-offers-label">
        <span>Example asking prices</span>
        <span>USD</span>
      </div>
      <a
        className="cinema-offer"
        href={links.ebay}
        target="_blank"
        rel="noopener noreferrer"
      >
        <span className="cinema-store-logo cinema-ebay" aria-hidden="true">
          e
        </span>
        <span className="cinema-offer-store">
          <b>eBay</b>
          <small>Search similar items</small>
        </span>
        <strong>${find.examples[0]}</strong>
        <ArrowUpRight size={17} aria-hidden="true" />
      </a>
      <a
        className="cinema-offer"
        href={links.etsy}
        target="_blank"
        rel="noopener noreferrer"
      >
        <span className="cinema-store-logo cinema-etsy" aria-hidden="true">
          E
        </span>
        <span className="cinema-offer-store">
          <b>Etsy</b>
          <small>Search vintage finds</small>
        </span>
        <strong>${find.examples[1]}</strong>
        <ArrowUpRight size={17} aria-hidden="true" />
      </a>
      <a
        className="cinema-marketplace"
        href={links.marketplace}
        target="_blank"
        rel="noopener noreferrer"
      >
        <img src={facebookLogo} width="24" height="24" alt="" />
        <span>
          <b>Facebook Marketplace</b>
          <small>Search nearby listings</small>
        </span>
        <ArrowUpRight size={18} aria-hidden="true" />
      </a>
      <p className="cinema-shopping-note">
        Illustrative prices. Links open current search results.
      </p>
    </aside>
  );
}

export function ThriftStory() {
  const { section, stage, chapter, portrait, reduced, go } = useStoryScroll();
  const [selectedId, setSelectedId] = useState("camera");
  const finds = portrait ? portraitFinds : wideFinds;
  const selected = finds.find((find) => find.id === selectedId) ?? finds[0];
  const choose = (id: string) => {
    setSelectedId(id);
    if (chapter !== 2) go(2, true);
  };
  return (
    <section
      className="cinema-story"
      id="how"
      ref={section}
      data-chapter={chapter}
      data-portrait={portrait}
      data-reduced={reduced}
      aria-label="Explore how Ceval works"
    >
      <div className="cinema-stage" ref={stage}>
        <div className="cinema-scene">
          <picture>
            <source
              media={PORTRAIT_QUERY}
              srcSet={sceneMedia.portrait.src}
              width={941}
              height={1672}
            />
            <img
              className="cinema-hero-image"
              src={sceneMedia.wide.src}
              width={1672}
              height={941}
              fetchPriority="high"
              alt="A sunlit thrift shop filled with vintage cameras, clothing, ceramics and other secondhand finds."
            />
          </picture>
          <div
            className="cinema-detections"
            aria-hidden={chapter === 0 || (portrait && chapter === 2)}
            inert={chapter === 0 || (portrait && chapter === 2)}
          >
            {finds.map((find, index) => (
              <button
                type="button"
                key={find.id}
                className="cinema-detection"
                data-selected={selected.id === find.id}
                style={
                  {
                    left: `${find.box.x * 100}%`,
                    top: `${find.box.y * 100}%`,
                    width: `${find.box.width * 100}%`,
                    height: `${find.box.height * 100}%`,
                    "--item-delay": `${index * 85}ms`,
                  } as CSSProperties
                }
                onClick={() => choose(find.id)}
                aria-label={`Compare ${find.name}`}
              >
                <span className="cinema-corner cinema-corner-tl" />
                <span className="cinema-corner cinema-corner-tr" />
                <span className="cinema-corner cinema-corner-bl" />
                <span className="cinema-corner cinema-corner-br" />
                <span className="cinema-detection-label">
                  <span />
                  {find.short}
                  <ArrowUpRight size={12} aria-hidden="true" />
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="cinema-shade" aria-hidden="true" />
        <div
          className="cinema-intro"
          aria-hidden={chapter !== 0}
          inert={chapter !== 0}
        >
          <p className="cinema-overline">A NEW WAY TO LOOK AT THINGS</p>
          <h1>
            See what
            <br />
            it’s worth.
          </h1>
          <p className="cinema-intro-line">
            Your camera. A world of better finds.
          </p>
          <button className="cinema-explore" onClick={() => go(1, true)}>
            Take a closer look <ArrowDown size={17} aria-hidden="true" />
          </button>
        </div>
        <div className="cinema-scan-copy" aria-hidden={chapter !== 1}>
          <p className="cinema-overline">
            <ScanLine size={14} aria-hidden="true" /> {finds.length} FINDS IN
            VIEW
          </p>
          <h2>
            A little curiosity.
            <br />A lot to discover.
          </h2>
          <p>Tap any find to explore it.</p>
        </div>
        <div className="cinema-compare-copy" aria-hidden={chapter !== 2}>
          <p className="cinema-overline">FROM IN FRONT OF YOU, TO EVERYWHERE</p>
          <h2>
            Find it.
            <br />
            For less.
          </h2>
        </div>
        <div
          className="cinema-results"
          aria-hidden={chapter !== 2}
          inert={chapter !== 2}
        >
          <ShoppingCard find={selected} portrait={portrait} />
          <div
            className="cinema-find-picker"
            role="group"
            aria-label="Choose a find to compare"
          >
            {finds.map((find) => (
              <button
                type="button"
                key={find.id}
                aria-pressed={find.id === selected.id}
                onClick={() => choose(find.id)}
                aria-label={`Show ${find.name}`}
              >
                <FindPhoto find={find} portrait={portrait} />
                <span>{find.short}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="cinema-scene-caption">
          AI-generated scene · Illustrative demo
        </div>
        <nav className="cinema-chapters" aria-label="Demo chapters">
          {["Explore", "Identify", "Compare"].map((name, index) => (
            <button
              type="button"
              key={name}
              onClick={() => go(index)}
              aria-current={chapter === index ? "step" : undefined}
            >
              <span className="cinema-chapter-track">
                <i />
              </span>
              <span>
                <small>0{index + 1}</small>
                {name}
              </span>
            </button>
          ))}
        </nav>
        <a
          className="cinema-story-next"
          href="#beyond"
          aria-label="Continue to more about Ceval"
        >
          <ArrowDown size={18} aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
