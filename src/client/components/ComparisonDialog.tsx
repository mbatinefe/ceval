import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Bookmark, Check, X } from "lucide-react";
import type { Comparison } from "../../shared/scan";
import { formatPrice } from "../../shared/demo";
import { api } from "../lib/api";
import { marketplaceSearch } from "../../shared/marketplace";
import { Price } from "./Price";
export function ComparisonDialog({
  comparison,
  onClose,
}: {
  comparison: Comparison;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [saved, setSaved] = useState(Boolean(comparison.saved));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  async function save() {
    setBusy(true);
    try {
      await api("/api/comparisons", { comparisonId: comparison.id });
      setSaved(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn’t save this comparison.",
      );
    } finally {
      setBusy(false);
    }
  }
  const stale = comparison.expiresAt < Date.now();
  return (
    <dialog
      ref={dialog}
      className="product-dialog comparison-dialog"
      aria-labelledby="comparison-title"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog-content">
        <div className="dialog-head">
          <span className="pill">
            {comparison.mode === "buy" ? "Online prices" : "Resale listings"}
          </span>
          <button
            className="icon-button"
            aria-label="Close comparison"
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <span className="eyebrow">{comparison.product.brand}</span>
        <h2 id="comparison-title">{comparison.product.model}</h2>
        <p className="muted">{comparison.product.variant}</p>
        {comparison.product.identification === "user_selected" && (
          <p className="result-note">
            Model selected by you from visual suggestions.
          </p>
        )}
        {comparison.product.shelfPriceMinor !== null &&
          comparison.product.shelfCurrency && (
            <div className="observed-price">
              <small className="price-label">Shelf label</small>
              <Price
                minor={comparison.product.shelfPriceMinor}
                currency={comparison.product.shelfCurrency}
              />
              <p>Read from your camera. Check the label before buying.</p>
            </div>
          )}
        <p className="comparison-time">
          Checked{" "}
          {new Date(comparison.checkedAt).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
          {stale ? " · Saved result; scan again for current prices" : ""}
        </p>
        {comparison.offers.length === 0 ? (
          <div className="offer-empty">
            <p>
              We couldn’t verify a price for this model.
              {comparison.sources?.length
                ? " These product pages may help. Check the model, condition and price with the seller."
                : " Try the model label or search Marketplace below."}
            </p>
          </div>
        ) : (
          ["retail", "sold", "asking"].map((kind) => {
            const offers = comparison.offers.filter((o) => o.kind === kind);
            if (!offers.length) return null;
            return (
              <section className="offer-group" key={kind}>
                <h3>
                  {kind === "retail"
                    ? "Retail offers"
                    : kind === "sold"
                      ? "Reported completed sales"
                      : "Asking prices · not completed sales"}
                </h3>
                {offers.map((offer) => {
                  const difference =
                    comparison.product.shelfPriceMinor !== null &&
                    comparison.product.shelfCurrency === offer.currency &&
                    offer.evidenceType !== "cited_summary" &&
                    offer.match === "exact" &&
                    offer.condition === "new" &&
                    kind === "retail"
                      ? comparison.product.shelfPriceMinor - offer.priceMinor
                      : null;
                  return (
                    <article className="offer-card" key={offer.url}>
                      <div className="offer-card-top">
                        <a
                          href={offer.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {new URL(offer.url).hostname.replace(/^www\./, "")}
                          <ArrowUpRight aria-hidden="true" />
                        </a>
                        <strong
                          className={
                            difference !== null && difference > 0
                              ? "is-lower"
                              : undefined
                          }
                        >
                          <Price
                            minor={offer.priceMinor}
                            currency={offer.currency}
                          />
                        </strong>
                      </div>
                      <p>{offer.title}</p>
                      {offer.evidenceType === "cited_summary" && (
                        <p className="muted">
                          Search-reported price · confirm with seller
                        </p>
                      )}
                      <small>
                        {offer.match === "exact"
                          ? "Model and variant match"
                          : "Possible match — check the variant"}{" "}
                        ·{" "}
                        {offer.condition === "unknown"
                          ? "Condition unspecified"
                          : offer.condition}
                      </small>
                      {difference !== null && difference > 0 && (
                        <p className="price-difference">
                          {formatPrice(difference, offer.currency)} lower item
                          price, before shipping and tax
                        </p>
                      )}
                      <details>
                        <summary>
                          {offer.evidenceType === "cited_summary"
                            ? "Meta’s cited summary"
                            : offer.evidenceType === "product_page"
                              ? "Product page evidence"
                              : "Source evidence"}
                        </summary>
                        <p>{offer.evidence}</p>
                      </details>
                    </article>
                  );
                })}
              </section>
            );
          })
        )}
        {comparison.sources?.length ? (
          <section className="offer-group related-sources">
            <h3>Related product pages</h3>
            <p className="source-note">Model and price unverified</p>
            {comparison.sources.map((source) => (
              <article className="offer-card" key={source.url}>
                <a href={source.url} target="_blank" rel="noopener noreferrer">
                  <strong>{source.title}</strong>
                  <ArrowUpRight aria-hidden="true" />
                </a>
                <small>
                  {new URL(source.url).hostname.replace(/^www\./, "")}
                </small>
              </article>
            ))}
          </section>
        ) : null}
        <a
          className="text-link marketplace-link"
          href={marketplaceSearch(comparison.product)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Search Facebook Marketplace <ArrowUpRight aria-hidden="true" />
        </a>
        <p className="source-note">
          Prices come from retrieved search evidence and may change. Confirm
          availability, condition, delivery and the final price on the source
          website. Asking prices do not predict what an item will sell for.
        </p>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button
          className="button primary full"
          onClick={save}
          disabled={saved || busy}
        >
          {saved ? (
            <Check aria-hidden="true" />
          ) : (
            <Bookmark aria-hidden="true" />
          )}{" "}
          {saved ? "Saved to your finds" : busy ? "Saving…" : "Save comparison"}
        </button>
      </div>
    </dialog>
  );
}
