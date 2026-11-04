import type { CSSProperties } from "react";
import { FindPhoto } from "./ThriftStory";
import { priceSummary } from "./price-summary";
import { wideFinds } from "./thrift-demo";

const kept = ["camera", "lamp", "jacket"].flatMap((id) =>
  wideFinds.filter((find) => find.id === id),
);
const tilt = ["-4deg", "1.5deg", "4deg"];

export function SavedFinds() {
  return (
    <section className="saved" id="finds" aria-labelledby="saved-title">
      <div className="saved-copy">
        <h2 id="saved-title">
          Keep what
          <br />
          you find.
        </h2>
        <p>
          Each find is saved with its photo, prices and links, so you can decide
          later. Delete any of them whenever you like.
        </p>
      </div>
      <div className="saved-line">
        <ul aria-label="Example saved finds">
          {kept.map((find, index) => {
            const summary = priceSummary(find.offers);
            return (
              <li
                className="saved-tag"
                key={find.id}
                style={{ "--r": tilt[index] } as CSSProperties}
              >
                <FindPhoto find={find} />
                <b>{find.name}</b>
                <span>
                  {summary
                    ? `${summary.range} · ${summary.detail}`
                    : "Saved for later"}
                </span>
              </li>
            );
          })}
        </ul>
        <svg
          className="saved-string"
          viewBox="0 0 600 60"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d="M0,4 Q300,72 600,4" />
        </svg>
      </div>
    </section>
  );
}
