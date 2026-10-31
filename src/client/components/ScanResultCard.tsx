import {
  ArrowUpRight,
  ChevronRight,
  LoaderCircle,
  RotateCw,
} from "lucide-react";
import type { FoundProduct } from "../scanner/useScanner";
import type { Comparison } from "../../shared/scan";
import { formatPrice } from "../../shared/demo";
import { marketplaceSearch } from "../../shared/marketplace";
import { offerSummary } from "../scanner/presentation";
import { isAllowanceError } from "../scanner/state";
import { Price } from "./Price";

export function ScanResultCard({
  row,
  compact = false,
  context = "RECENT FIND",
  active = false,
  onFocus,
  onChoose,
  onReview,
  onRetry,
  onVisual,
}: {
  row: FoundProduct;
  compact?: boolean;
  context?: string;
  active?: boolean;
  onFocus?: () => void;
  onChoose: () => void;
  onReview: (comparison: Comparison) => void;
  onRetry?: () => void;
  onVisual?: () => void;
}) {
  const summary = offerSummary(row.comparison);
  const needsModel = !row.comparison && Boolean(row.product.candidates?.length);
  const title = row.product.model || row.product.label;
  const unidentified =
    !row.product.model ||
    (row.product.confidence < 0.85 &&
      row.product.identification !== "user_selected");
  const { shelfPriceMinor, shelfCurrency } = row.product;
  const savings =
    summary?.savingsMinor != null && row.errorCode !== "shelf_changed"
      ? summary.savingsMinor
      : null;
  return (
    <article
      className={`${compact ? "current-find" : "scan-result"}${active ? " is-active" : ""}`}
      id={compact ? undefined : `result-${row.rowId || row.product.id}`}
    >
      <div className="find-head">
        {row.thumbnail && (
          <img
            className="scan-product-photo"
            src={row.thumbnail}
            alt={title}
            loading="lazy"
          />
        )}
        <div className="find-name">
          <span className="find-brand">
            {compact
              ? [context, row.product.brand].filter(Boolean).join(" · ")
              : row.product.brand || "Detected item"}
          </span>
          {onFocus ? (
            <button className="find-title" onClick={onFocus}>
              {title}
            </button>
          ) : (
            <h2 className="find-title">{title}</h2>
          )}
          {!compact && row.product.variant && (
            <p className="find-variant">
              {row.product.variant}
              {row.product.identification === "user_selected"
                ? " · Model chosen by you"
                : ""}
            </p>
          )}
        </div>
      </div>
      {summary && (
        <div className="find-prices">
          {shelfPriceMinor !== null && shelfCurrency && (
            <div className="find-shelf">
              <small className="price-label">Shelf label</small>
              <b className={savings !== null ? "is-struck" : undefined}>
                {formatPrice(shelfPriceMinor, shelfCurrency)}
              </b>
            </div>
          )}
          <div className="find-price">
            <small className="price-label">{summary.label}</small>
            <Price
              minor={summary.offer.priceMinor}
              currency={summary.offer.currency}
            />
            {summary.qualification && <span>{summary.qualification}</span>}
          </div>
        </div>
      )}
      {row.visualSearching && (
        <p className="searching-price">
          <LoaderCircle className="spin" aria-hidden="true" />
          Finding matches from your photo…
        </p>
      )}
      {row.visualSearch?.candidates.length ? (
        <p className="result-note">
          {row.visualSearch.candidates.length} photo matches · model unconfirmed
        </p>
      ) : null}
      {row.searching || row.selecting ? (
        <p className="searching-price">
          <LoaderCircle className="spin" aria-hidden="true" />
          {row.selecting
            ? "Confirming model…"
            : "Searching shops and marketplaces…"}
        </p>
      ) : row.error ? (
        <p className="result-note result-error">
          {isAllowanceError(row.errorCode)
            ? "Price search paused. Try again later."
            : row.error}
        </p>
      ) : needsModel ? (
        <p className="result-note">
          Compare photo matches or choose a model to search prices.
        </p>
      ) : (
        !summary && (
          <p className="result-note">
            {row.comparison
              ? row.comparison.sources?.length
                ? "Product pages found. Confirm the model and price with the seller."
                : "No verified price yet. Check listings or show the model label."
              : unidentified
                ? "Search by photo or show the model label."
                : "Ready to compare."}
          </p>
        )
      )}
      {summary && (
        <p className="find-evidence">
          <b>{new URL(summary.offer.url).hostname.replace(/^www\./, "")}</b>
          {summary.offer.condition === "new" ? " · New" : ""}
          {savings !== null && (
            <strong>
              {formatPrice(savings, summary.offer.currency)} below the shelf
              label
            </strong>
          )}
        </p>
      )}
      <div className="find-actions">
        {row.comparison && (
          <button
            className="find-action primary-action"
            onClick={() => onReview(row.comparison!)}
          >
            {row.comparison.offers.length
              ? `View ${row.comparison.mode === "buy" ? "prices" : "listings"}`
              : row.comparison.sources?.length
                ? "See product pages"
                : "Search options"}
            <ArrowUpRight aria-hidden="true" />
          </button>
        )}
        {needsModel && !row.selecting && (
          <button className="find-action primary-action" onClick={onChoose}>
            Choose model <ChevronRight aria-hidden="true" />
          </button>
        )}
        {onVisual && row.thumbnail && (
          <button
            className={`find-action${row.comparison || needsModel ? "" : " primary-action"}`}
            onClick={onVisual}
          >
            {row.visualSearching
              ? "Searching by photo…"
              : row.visualSearch
                ? "Photo matches"
                : "Search by photo"}
            <ChevronRight aria-hidden="true" />
          </button>
        )}
        {unidentified && !needsModel && !row.searching && !onVisual && (
          <a
            className="find-action"
            href={`https://www.google.com/search?${new URLSearchParams({ q: [row.product.brand, row.product.label, row.product.variant].filter(Boolean).join(" ") })}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Search this item <ArrowUpRight aria-hidden="true" />
          </a>
        )}
        {onRetry && !row.searching && !row.selecting && (
          <button className="find-action" onClick={onRetry}>
            <RotateCw aria-hidden="true" /> Retry search
          </button>
        )}
        {!needsModel &&
          !row.searching &&
          !row.selecting &&
          !summary &&
          row.product.model && (
            <a
              className="find-action"
              href={marketplaceSearch(row.product)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Marketplace <ArrowUpRight aria-hidden="true" />
            </a>
          )}
      </div>
    </article>
  );
}
