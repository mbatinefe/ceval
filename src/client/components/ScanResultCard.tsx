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
  return (
    <article
      className={`${compact ? "current-find" : "scan-result"}${active ? " is-active" : ""}`}
      id={compact ? undefined : `result-${row.rowId || row.product.id}`}
    >
      {row.thumbnail && (
        <img
          className="scan-product-photo"
          src={row.thumbnail}
          alt={title}
          loading="lazy"
        />
      )}
      <div className="find-card-heading">
        <div>
          <span className="find-brand">
            {compact ? context : row.product.brand || "Detected item"}
          </span>
          {onFocus ? (
            <button className="find-title" onClick={onFocus}>
              {title}
            </button>
          ) : (
            <h2>{title}</h2>
          )}
        </div>
        {summary && (
          <div className="find-price">
            <strong>
              {formatPrice(summary.offer.priceMinor, summary.offer.currency)}
            </strong>
            <small>
              {summary.label}
              {summary.qualification && <span>{summary.qualification}</span>}
            </small>
          </div>
        )}
      </div>
      {!compact && row.product.variant && (
        <p className="find-variant">
          {row.product.variant}
          {row.product.identification === "user_selected"
            ? " · Model chosen by you"
            : ""}
        </p>
      )}
      {row.visualSearching && (
        <p className="searching-price">
          <LoaderCircle size={14} className="spin" />
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
          <LoaderCircle size={14} className="spin" />
          {row.selecting
            ? "Confirming model…"
            : "Searching shops & marketplaces…"}
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
      {summary && !compact && (
        <p className="find-evidence">
          {new URL(summary.offer.url).hostname.replace(/^www\./, "")} ·{" "}
          {summary.offer.match === "possible"
            ? "Possible match"
            : summary.offer.condition === "unknown"
              ? "Check condition"
              : summary.offer.condition}
          {summary.savingsMinor !== null &&
            row.errorCode !== "shelf_changed" && (
              <span>
                {formatPrice(summary.savingsMinor, summary.offer.currency)}{" "}
                below shelf label
              </span>
            )}
        </p>
      )}
      <div className="find-actions">
        {onVisual && row.thumbnail && (
          <button className="find-action primary-action" onClick={onVisual}>
            {row.visualSearching
              ? "See image search"
              : row.visualSearch
                ? "View photo matches"
                : "Find image matches"}
            <ChevronRight size={15} />
          </button>
        )}
        {unidentified && !needsModel && !row.searching && !onVisual && (
          <a
            className="find-action"
            href={`https://www.google.com/search?${new URLSearchParams({ q: [row.product.brand, row.product.label, row.product.variant].filter(Boolean).join(" ") })}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Search this item <ArrowUpRight size={14} />
          </a>
        )}
        {needsModel && !row.selecting && (
          <button className="find-action primary-action" onClick={onChoose}>
            Choose model <ChevronRight size={15} />
          </button>
        )}
        {row.comparison && (
          <button
            className="find-action primary-action"
            onClick={() => onReview(row.comparison!)}
          >
            {row.comparison.offers.length
              ? `View ${row.comparison.mode === "buy" ? "prices" : "listings"}`
              : row.comparison.sources?.length
                ? "See product pages"
                : "Search options"}{" "}
            <ArrowUpRight size={14} />
          </button>
        )}
        {onRetry && !row.searching && !row.selecting && (
          <button className="find-action" onClick={onRetry}>
            <RotateCw size={13} /> Retry search
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
              Marketplace <ArrowUpRight size={14} />
            </a>
          )}
      </div>
    </article>
  );
}
