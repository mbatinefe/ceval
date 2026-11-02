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
import facebookLogo from "../assets/facebook.png";

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
  const checking = row.searching || row.selecting || row.visualSearching;
  const seller = summary
    ? new URL(summary.offer.url).hostname.replace(/^www\./, "")
    : null;
  const state = row.selecting
    ? "Confirming model…"
    : row.searching
      ? "Checking prices…"
      : row.visualSearching
        ? "Matching your photo…"
        : needsModel || unidentified
          ? "Confirm the model"
          : "No verified price found";
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
          <p className="find-variant">
            {[
              row.product.variant,
              row.product.identification === "user_selected"
                ? "Model chosen by you"
                : unidentified
                  ? "Model unconfirmed"
                  : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>
      {summary ? (
        <>
          <div className="find-prices">
            <div className="find-price">
              <small className="price-label">{summary.label}</small>
              <Price
                minor={summary.offer.priceMinor}
                currency={summary.offer.currency}
              />
              {summary.qualification && <span>{summary.qualification}</span>}
            </div>
            {shelfPriceMinor !== null && shelfCurrency && (
              <div className="find-shelf">
                <small className="price-label">Shelf label</small>
                <b className={savings !== null ? "is-struck" : undefined}>
                  {formatPrice(shelfPriceMinor, shelfCurrency)}
                </b>
              </div>
            )}
          </div>
          <p className="find-evidence">
            <b>{seller}</b>
            {summary.offer.condition === "new" ? " · New" : ""}
            {savings !== null && (
              <strong>
                {formatPrice(savings, summary.offer.currency)} below shelf ·
                before delivery & tax
              </strong>
            )}
          </p>
        </>
      ) : (
        <div
          className={`find-price-state${checking ? " is-checking" : ""}`}
          role="status"
        >
          {checking && <LoaderCircle className="spin" aria-hidden="true" />}
          <strong>{state}</strong>
          {!checking && (
            <span>
              {row.comparison?.sources?.length
                ? "Product pages found; prices could not be verified."
                : needsModel || unidentified
                  ? "Compare the matches to get the right price."
                  : "Try another search or check Marketplace."}
            </span>
          )}
        </div>
      )}
      {summary && checking && (
        <p className="searching-price">
          <LoaderCircle className="spin" aria-hidden="true" />
          Checking more matches…
        </p>
      )}
      {row.error && !checking && (
        <p className="result-note result-error">
          {isAllowanceError(row.errorCode)
            ? "Search allowance reached. Your finds are saved."
            : row.error}
        </p>
      )}
      <div className="find-actions">
        {summary && (
          <a
            className="find-action primary-action open-offer"
            href={summary.offer.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {summary.offer.kind === "sold"
              ? "View sale"
              : summary.offer.kind === "asking"
                ? "View listing"
                : "Open offer"}
            <ArrowUpRight aria-hidden="true" />
          </a>
        )}
        {row.comparison && (
          <button
            className={`find-action${summary ? "" : " primary-action"}`}
            onClick={() => onReview(row.comparison!)}
          >
            {row.comparison.offers.length
              ? `Compare ${row.comparison.offers.length} ${row.comparison.offers.length === 1 ? "offer" : "offers"}`
              : row.comparison.sources?.length
                ? "Product pages"
                : "Search details"}
            <ChevronRight aria-hidden="true" />
          </button>
        )}
        {needsModel && !row.selecting && (
          <button className="find-action primary-action" onClick={onChoose}>
            Choose model
            <ChevronRight aria-hidden="true" />
          </button>
        )}
        {onVisual && row.thumbnail && (!compact || !summary) && (
          <button
            className={`find-action${!summary && !needsModel && !row.comparison ? " primary-action" : ""}`}
            onClick={onVisual}
          >
            {row.visualSearching
              ? "Photo search…"
              : row.visualSearch
                ? "Photo matches"
                : "Search by photo"}
            <ChevronRight aria-hidden="true" />
          </button>
        )}
        {onRetry && !checking && (
          <button className="find-action" onClick={onRetry}>
            <RotateCw aria-hidden="true" />
            Retry search
          </button>
        )}
      </div>
      {(row.product.brand || row.product.model) && (
        <a
          className="marketplace-action"
          href={marketplaceSearch(row.product)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Search Facebook Marketplace for ${title}`}
        >
          <img src={facebookLogo} width="20" height="20" alt="" />
          <span>Search Marketplace</span>
          <ArrowUpRight aria-hidden="true" />
        </a>
      )}
    </article>
  );
}
