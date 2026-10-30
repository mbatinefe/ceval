import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Bookmark, Check, X } from "lucide-react";
import type { Comparison } from "../../shared/scan";
import { formatPrice } from "../../shared/demo";
import { api } from "../lib/api";
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
          <span className="pill subtle">
            {comparison.mode === "buy"
              ? "ONLINE COMPARISON"
              : "RESALE LISTINGS"}
          </span>
          <button
            className="icon-button"
            aria-label="Close comparison"
            onClick={onClose}
          >
            <X size={21} />
          </button>
        </div>
        <span className="eyebrow">{comparison.product.brand}</span>
        <h2 id="comparison-title">{comparison.product.model}</h2>
        <p className="muted">{comparison.product.variant}</p>
        {comparison.product.shelfPriceMinor !== null &&
          comparison.product.shelfCurrency && (
            <p className="observed-price">
              Observed shelf label:{" "}
              <strong>
                {formatPrice(
                  comparison.product.shelfPriceMinor,
                  comparison.product.shelfCurrency,
                )}
              </strong>
              <br />
              <small>Read from the frame; check the label before buying.</small>
            </p>
          )}
        <p className="comparison-time">
          Checked {new Date(comparison.checkedAt).toLocaleString()}
          {stale ? " · Saved result; scan again for current prices" : ""}
        </p>
        {comparison.offers.length === 0 ? (
          <div className="offer-empty">
            <p>
              No sufficiently supported offers found. Try a clearer model label
              or a different market.
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
                          <ArrowUpRight size={14} />
                        </a>
                        <strong>
                          {formatPrice(offer.priceMinor, offer.currency)}
                        </strong>
                      </div>
                      <p>{offer.title}</p>
                      {offer.evidenceType === "cited_summary" && (
                        <p className="muted">
                          Search-reported price · confirm at retailer
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
                          price · before shipping/tax
                        </p>
                      )}
                      <details>
                        <summary>
                          {offer.evidenceType === "cited_summary"
                            ? "Meta’s cited summary"
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
          {saved ? <Check size={17} /> : <Bookmark size={17} />}{" "}
          {saved ? "Saved to your finds" : busy ? "Saving…" : "Save comparison"}
        </button>
      </div>
    </dialog>
  );
}
