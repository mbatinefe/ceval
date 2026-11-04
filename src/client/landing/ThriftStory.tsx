import { useState, type CSSProperties } from "react";
import { ArrowDown, ArrowUpRight, ImageOff } from "lucide-react";
import {
  campaignPrice,
  campaignMatchLabel,
  campaignReferencePrice,
  type CampaignOffer,
} from "../../shared/campaign-listings";
import { MarketplaceLinks } from "./MarketplaceLinks";
import { checkedDate, priceSummary } from "./price-summary";
import {
  portraitFinds,
  sceneMedia,
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
    <span className="price-tag-listing-photo" title={offer.imageCredit}>
      {missing ? (
        <ImageOff size={17} role="img" aria-label="Product photo unavailable" />
      ) : (
        <img
          src={offer.image}
          alt={[offer.title, offer.imageCredit].filter(Boolean).join(". ")}
          width={40}
          height={44}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setMissing(true)}
        />
      )}
    </span>
  );
}

function PriceTag({ find, portrait }: { find: ThriftFind; portrait: boolean }) {
  const summary = priceSummary(find.offers);
  const checkedAt = find.offers[0].checkedAt;
  return (
    <aside className="price-tag" aria-label={`Prices for ${find.name}`}>
      <div className="price-tag-head">
        <span className="price-tag-photo">
          <FindPhoto find={find} portrait={portrait} />
        </span>
        <div>
          <span className="price-tag-brand">{find.brand}</span>
          <h3>{find.model}</h3>
          <p>
            <span className="price-tag-match" data-match={find.match}>
              {campaignMatchLabel(find.match)}
            </span>
            {find.matchNote}
          </p>
        </div>
      </div>
      <div className="price-tag-range">
        <small>{summary ? summary.detail : "Prices change often"}</small>
        <strong data-empty={!summary}>
          {summary ? summary.range : "See the listings"}
        </strong>
      </div>
      <ul className="price-tag-offers">
        {find.offers.map((offer) => {
          const price = campaignPrice(offer);
          const list = campaignReferencePrice(offer);
          return (
            <li key={offer.url}>
              <a
                href={offer.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${offer.merchant}: ${offer.title}. ${offer.condition}. ${price || "Check price"}.${list ? ` List price ${list}.` : ""} Opens product page.`}
              >
                <ListingPhoto offer={offer} />
                <span className="price-tag-store">
                  <b>{offer.merchant}</b>
                  <small>{offer.condition}</small>
                  {list && <small>List price {list}</small>}
                </span>
                {price ? (
                  <strong>{price}</strong>
                ) : (
                  <span className="price-tag-view">View listing</span>
                )}
                <ArrowUpRight size={15} aria-hidden="true" />
              </a>
            </li>
          );
        })}
      </ul>
      <MarketplaceLinks product={find} />
      <p className="price-tag-date">
        USD · Listings checked{" "}
        <time dateTime={checkedAt}>{checkedDate(checkedAt)}</time>
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
  const checkedAt = wideFinds[0].offers[0].checkedAt;
  return (
    <section
      className="cinema-story"
      id="how"
      ref={section}
      data-chapter={chapter}
      data-portrait={portrait}
      data-reduced={reduced}
      aria-label="How Ceval works"
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
                    "--item-delay": `${index * 120}ms`,
                  } as CSSProperties
                }
                onClick={() => choose(find.id)}
                aria-label={`Compare prices for ${find.name}`}
              >
                <span className="cinema-corner cinema-corner-tl" />
                <span className="cinema-corner cinema-corner-tr" />
                <span className="cinema-corner cinema-corner-bl" />
                <span className="cinema-corner cinema-corner-br" />
                <span className="find-tag-string" />
                <span className="find-tag">
                  <span>{find.name}</span>
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
            Point your phone at it. Ceval names it and finds its price, new and
            used.
          </p>
          <button className="cinema-explore" onClick={() => go(1, true)}>
            Take a closer look <ArrowDown size={17} aria-hidden="true" />
          </button>
        </div>
        <div className="cinema-scan-copy" aria-hidden={chapter !== 1}>
          <p className="cinema-overline">{finds.length} finds in view</p>
          <h2>
            Ceval names
            <br />
            what it sees.
          </h2>
          <p>Tap a tag to compare prices.</p>
        </div>
        <div className="cinema-compare-copy" aria-hidden={chapter !== 2}>
          <h2>
            Every price,
            <br />
            with its source.
          </h2>
        </div>
        <div
          className="cinema-results"
          aria-hidden={chapter !== 2}
          inert={chapter !== 2}
        >
          <span className="price-tag-string" aria-hidden="true" />
          <PriceTag key={selected.id} find={selected} portrait={portrait} />
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
        <div className="cinema-rail">
          <nav className="cinema-chapters" aria-label="Story chapters">
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
                  <small>{index + 1}</small>
                  {name}
                </span>
              </button>
            ))}
          </nav>
          <p className="cinema-caption">
            Illustrated scene · Listings checked{" "}
            <time dateTime={checkedAt}>{checkedDate(checkedAt)}</time>
          </p>
        </div>
        <a
          className="cinema-story-next"
          href="#everywhere"
          aria-label="Skip to more places to use Ceval"
        >
          <ArrowDown size={18} aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
