import { useState, type CSSProperties } from "react";
import { ArrowDown, ArrowUpRight, ImageOff, ScanLine } from "lucide-react";
import {
  campaignPrice,
  campaignMatchLabel,
  type CampaignOffer,
} from "../../shared/campaign-listings";
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

function ListingPhoto({ offer }: { offer: CampaignOffer }) {
  const [missing, setMissing] = useState(false);
  return (
    <span className="cinema-listing-photo" title={offer.imageCredit}>
      {missing ? (
        <ImageOff size={19} role="img" aria-label="Product photo unavailable" />
      ) : (
        <img
          src={offer.image}
          alt={[offer.title, offer.imageCredit].filter(Boolean).join(". ")}
          width={52}
          height={58}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setMissing(true)}
        />
      )}
    </span>
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
  const prices = find.offers.map((offer) => campaignPrice(offer));
  const date = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(find.offers[0].checkedAt));
  return (
    <aside
      className="cinema-shopping"
      aria-label={`Product listings for ${find.name}`}
    >
      <div className="cinema-shopping-heading">
        <span className="cinema-product-photo">
          <FindPhoto find={find} portrait={portrait} />
        </span>
        <div>
          <span className="cinema-product-brand">{find.brand}</span>
          <h3>{find.model}</h3>
          <p>{find.matchNote}</p>
        </div>
      </div>
      <div className="cinema-model-match" data-match={find.match}>
        {campaignMatchLabel(find.match)}
      </div>
      <div className="cinema-offers-label">
        <span>
          {prices.some(Boolean)
            ? "Listed prices · USD"
            : "Check current prices"}
        </span>
        <time dateTime={find.offers[0].checkedAt} title="Source snapshot date">
          {date}
        </time>
      </div>
      {find.offers.map((offer, index) => (
        <a
          className="cinema-offer"
          key={offer.url}
          href={offer.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${offer.merchant}: ${offer.title}. ${offer.condition}. ${prices[index] || "Check price"}. Opens product page.`}
        >
          <ListingPhoto offer={offer} />
          <span className="cinema-offer-store">
            <b>{offer.merchant}</b>
            <small>{offer.condition}</small>
          </span>
          {prices[index] ? (
            <strong>{prices[index]}</strong>
          ) : (
            <span className="cinema-check-price">View listing</span>
          )}
          <ArrowUpRight size={16} aria-hidden="true" />
        </a>
      ))}
      <a
        className="cinema-marketplace"
        href={links.marketplace}
        target="_blank"
        rel="noopener noreferrer"
      >
        <img src={facebookLogo} width="24" height="24" alt="" />
        <span>
          <b>Facebook Marketplace</b>
          <small>Search this model nearby</small>
        </span>
        <ArrowUpRight size={18} aria-hidden="true" />
      </a>
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
              alt="Illustrated thrift-shop scene featuring a Nikon FM2 body, Converse Chuck 70 shoes, a Levi’s Trucker jacket and an Anglepoise desk lamp."
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
                  {find.id === "camera" ? find.name : find.short}
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
          <h1>
            See what
            <br />
            it’s worth.
          </h1>
          <p className="cinema-intro-line">
            Find better prices. Spot resale potential.
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
          <ShoppingCard key={selected.id} find={selected} portrait={portrait} />
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
