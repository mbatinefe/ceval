import { useRef, useState, type KeyboardEvent } from "react";
import { ArrowUpRight } from "lucide-react";
import {
  campaignPrice,
  campaignReferencePrice,
} from "../../shared/campaign-listings";
import { MarketplaceLinks } from "./MarketplaceLinks";
import { places } from "./places";
import "../styles/places.css";

export function Everywhere() {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const scene = places[active];
  const current = campaignPrice(scene.source);
  const list = campaignReferencePrice(scene.source);
  const price = current ?? list;
  const [x, y, w, h] = scene.box.map((v, i) => v * (i % 2 === 0 ? 1672 : 941));
  const corner = 27;
  const date = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(scene.source.checkedAt));
  const changeWithKey = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % places.length
        : event.key === "ArrowLeft"
          ? (index - 1 + places.length) % places.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? places.length - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    tabs.current[next]?.focus({ preventScroll: true });
  };
  return (
    <section
      className="places-section"
      id="everywhere"
      aria-labelledby="places-title"
    >
      <div className="places-heading">
        <span className="places-eyebrow">OUT IN THE WORLD</span>
        <h2 id="places-title">
          Finds happen
          <br />
          <span>everywhere.</span>
        </h2>
      </div>
      <div
        className="places-tabs"
        role="tablist"
        aria-label="Explore places to use Ceval"
      >
        {places.map((place, index) => (
          <button
            key={place.id}
            ref={(node) => {
              tabs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`place-tab-${place.id}`}
            aria-selected={active === index}
            aria-controls="place-panel"
            tabIndex={active === index ? 0 : -1}
            onClick={() => setActive(index)}
            onKeyDown={(event) => changeWithKey(event, index)}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            {place.place}
          </button>
        ))}
      </div>
      <div
        className="places-panel"
        role="tabpanel"
        id="place-panel"
        aria-labelledby={`place-tab-${scene.id}`}
        data-place={scene.id}
        tabIndex={0}
      >
        <div className="places-visual" key={scene.id}>
          <img
            className="places-image"
            src={`/campaign/places/${scene.id}.webp`}
            width={1672}
            height={941}
            alt={scene.alt}
            loading="lazy"
            decoding="async"
          />
          <div className="places-vignette" aria-hidden="true" />
          <svg
            className="places-scan"
            viewBox="0 0 1672 941"
            preserveAspectRatio="xMidYMid slice"
            aria-hidden="true"
          >
            <path
              d={`M${x},${y + corner}V${y}H${x + corner} M${x + w - corner},${y}H${x + w}V${y + corner} M${x + w},${y + h - corner}V${y + h}H${x + w - corner} M${x + corner},${y + h}H${x}V${y + h - corner}`}
            />
          </svg>
          <p className="places-line">{scene.line}</p>
        </div>
        <aside
          className="places-card"
          aria-label={`Example comparison for ${scene.brand} ${scene.model}`}
        >
          <span className="places-product-brand">{scene.brand}</span>
          <h3>{scene.model}</h3>
          <p className="places-product-note">{scene.note}</p>
          <MarketplaceLinks product={scene} />
          <a
            className="places-retail"
            href={scene.source.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${scene.sourceLabel}: ${price ?? "Check current price"}. ${scene.source.condition}. Opens product page.`}
          >
            <span>
              <small>{scene.sourceLabel}</small>
              <strong>{price ?? "Check price"}</strong>
            </span>
            <ArrowUpRight size={19} aria-hidden="true" />
          </a>
          <div className="places-source-note">
            <span>{scene.source.condition}</span>
            <time dateTime={scene.source.checkedAt}>{date}</time>
          </div>
          {current && list && (
            <p className="places-original">Brand list price {list}</p>
          )}
        </aside>
      </div>
    </section>
  );
}
