import type { CSSProperties } from "react";
import { ArrowUpRight } from "lucide-react";
import {
  campaignPrice,
  campaignReferencePrice,
} from "../../shared/campaign-listings";
import { checkedDate } from "./price-summary";
import { places, type PlaceScene } from "./places";
import "../styles/places.css";

// New products first; the thrift-story finds come after.
const order = ["sneakers", "books", "tech", "flea", "wardrobe", "furniture"];
const strip = [...places].sort(
  (a, b) => order.indexOf(a.id) - order.indexOf(b.id),
);
const W = 1672;
const H = 941;
const C = 30;

function Place({ scene }: { scene: PlaceScene }) {
  const current = campaignPrice(scene.source);
  const list = campaignReferencePrice(scene.source);
  const price = current ?? list;
  const [x, y, w, h] = scene.box;
  const [px, py, pw, ph] = [x * W, y * H, w * W, h * H];
  const note = [
    scene.source.condition,
    current && list ? `List price ${list}` : null,
  ].filter(Boolean);
  return (
    <li className="place">
      <div className="place-photo">
        <img
          src={`/campaign/places/${scene.id}.webp`}
          width={W}
          height={H}
          alt={scene.alt}
          loading="lazy"
          decoding="async"
        />
        <svg
          className="place-brackets"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
        >
          <path
            d={`M${px},${py + C}V${py}H${px + C} M${px + pw - C},${py}H${px + pw}V${py + C} M${px + pw},${py + ph - C}V${py + ph}H${px + pw - C} M${px + C},${py + ph}H${px}V${py + ph - C}`}
          />
        </svg>
        <span
          className="place-tag"
          style={
            { left: `${x * 100}%`, top: `${(y + h) * 100}%` } as CSSProperties
          }
          aria-hidden="true"
        >
          <span className="find-tag-string" />
          <span className="find-tag">
            <span>
              {scene.brand} {scene.model}
            </span>
          </span>
        </span>
      </div>
      <h3>{scene.place}</h3>
      <p className="place-line">{scene.line}</p>
      <a
        className="place-price"
        href={scene.source.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${scene.sourceLabel} for ${scene.brand} ${scene.model}: ${price ?? "check the current price"}. ${scene.source.condition}. Opens product page.`}
      >
        <small>{scene.sourceLabel}</small>
        <strong>{price ?? "Check price"}</strong>
        <ArrowUpRight size={17} aria-hidden="true" />
      </a>
      <p className="place-note">
        {note.join(" · ")} ·{" "}
        <time dateTime={scene.source.checkedAt}>
          {checkedDate(scene.source.checkedAt)}
        </time>
      </p>
    </li>
  );
}

export function Everywhere() {
  return (
    <section
      className="places-section"
      id="everywhere"
      aria-labelledby="places-title"
    >
      <div className="places-heading">
        <h2 id="places-title">Not just thrift shops.</h2>
        <p>
          Sneaker stores, bookshops, flea markets, even your own wardrobe. Point
          Ceval at whatever caught your eye.
        </p>
      </div>
      <ul className="places-strip" aria-label="Example finds in other places">
        {strip.map((scene) => (
          <Place key={scene.id} scene={scene} />
        ))}
      </ul>
    </section>
  );
}
