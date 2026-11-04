import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import {
  campaignMatchLabel,
  campaignPrice,
  campaignReferencePrice,
} from "../../shared/campaign-listings";
import { MarketplaceLinks } from "./MarketplaceLinks";
import { checkedDate, priceSummary } from "./price-summary";
import { portraitFinds as finds, type ThriftFind } from "./thrift-demo";

function ProductPhoto({ find }: { find: ThriftFind }) {
  const [missing, setMissing] = useState(false);
  const offer = find.offers[0];
  if (missing)
    return (
      <span className="result-photo" aria-hidden="true">
        {find.brand.slice(0, 1)}
      </span>
    );
  return (
    <img
      className="result-photo"
      src={offer.image}
      alt={[offer.title, offer.imageCredit].filter(Boolean).join(". ")}
      title={offer.imageCredit}
      width={60}
      height={60}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setMissing(true)}
    />
  );
}

// A real result from dated store listings, so visitors see what Ceval returns
// before they open the camera.
export function ExampleResult() {
  const [selectedId, setSelectedId] = useState(finds[0].id);
  const find = finds.find((item) => item.id === selectedId) ?? finds[0];
  const summary = priceSummary(find.offers);
  const checkedAt = find.offers[0].checkedAt;
  return (
    <div className="example">
      <div className="example-picker" role="group" aria-label="Example finds">
        {finds.map((item) => (
          <button
            type="button"
            key={item.id}
            aria-pressed={item.id === find.id}
            onClick={() => setSelectedId(item.id)}
          >
            {item.name}
          </button>
        ))}
      </div>
      <article className="result" aria-label={`Example result: ${find.name}`}>
        <header className="result-head">
          <ProductPhoto key={find.id} find={find} />
          <div>
            <span className="result-brand">{find.brand}</span>
            <h3>{find.model}</h3>
            <p>{find.matchNote}</p>
          </div>
          <span className="result-match" data-match={find.match}>
            {campaignMatchLabel(find.match)}
          </span>
        </header>
        <div className="result-price">
          <span>{summary ? summary.detail : "Prices change often"}</span>
          <strong data-empty={!summary}>
            {summary ? summary.range : "See the listings"}
          </strong>
        </div>
        <ul className="result-offers">
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
                  <span>
                    <b>{offer.merchant}</b>
                    <small>
                      {offer.condition}
                      {list ? ` · List price ${list}` : ""}
                    </small>
                  </span>
                  {price ? <strong>{price}</strong> : <em>View listing</em>}
                  <ArrowUpRight size={15} aria-hidden="true" />
                </a>
              </li>
            );
          })}
        </ul>
        <MarketplaceLinks product={find} />
        <p className="result-note">
          Example result · Asking prices from listings checked{" "}
          <time dateTime={checkedAt}>{checkedDate(checkedAt)}</time>
        </p>
      </article>
    </div>
  );
}
