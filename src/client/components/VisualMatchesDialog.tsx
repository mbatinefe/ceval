import { useEffect, useRef } from "react";
import { ArrowUpRight, ImageOff, LoaderCircle, Search, X } from "lucide-react";
import { formatPrice } from "../../shared/demo";
import type { Mode, Product } from "../../shared/scan";
import {
  visualCandidateKey,
  type VisualSearch,
} from "../../shared/visual-search";
export function VisualMatchesDialog({
  product,
  photo,
  result,
  searching,
  error,
  mode,
  onSearch,
  onChoose,
  onClose,
}: {
  product: Product;
  photo?: string;
  result?: VisualSearch;
  searching?: boolean;
  error?: string;
  mode: Mode;
  onSearch: () => void;
  onChoose: (key: string) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  const expired = Boolean(result && result.expiresAt <= Date.now());
  return (
    <dialog
      ref={dialog}
      className="product-dialog visual-dialog"
      aria-labelledby="visual-title"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog-content">
        <div className="dialog-head">
          <span className="eyebrow">SEARCH BY IMAGE</span>
          <button
            className="icon-button"
            aria-label="Close image matches"
            onClick={onClose}
          >
            <X size={21} />
          </button>
        </div>
        <div className="visual-query">
          {photo && <img src={photo} alt="Your scanned item" />}
          <div>
            <h2 id="visual-title">Find its match.</h2>
            <p>{product.model || product.label}</p>
          </div>
        </div>
        <p className="visual-explainer">
          Compare the photos. Check the model label before choosing.
        </p>
        {mode === "resale" && (
          <p className="result-note">
            These are related listings, not a resale valuation or verified sold
            prices.
          </p>
        )}
        <div aria-live="polite" aria-atomic="true">
          {searching ? (
            <p className="visual-loading">
              <LoaderCircle className="spin" size={20} /> Finding similar
              products and comparing photos…
            </p>
          ) : error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : result && !result.candidates.length ? (
            <p className="visual-empty">
              No useful matches from this photo. Try a closer view of the item
              or its label.
            </p>
          ) : null}
        </div>
        {result && (
          <>
            <p className="visual-status">
              {result.ranking === "meta"
                ? "Available photos compared by Meta"
                : result.ranking === "unavailable"
                  ? "Image search results · photo comparison unavailable"
                  : "Image search complete"}{" "}
              · Exact model unconfirmed
            </p>
            <div className="visual-candidates">
              {result.candidates.map((candidate) => (
                <article className="visual-candidate" key={candidate.id}>
                  <a
                    className="visual-candidate-photo"
                    href={candidate.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`View ${candidate.title}`}
                  >
                    {candidate.thumbnail ? (
                      <img
                        src={candidate.thumbnail}
                        alt={candidate.title}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                        }}
                      />
                    ) : (
                      <ImageOff size={28} />
                    )}
                    <span>
                      {candidate.assessment === "likely"
                        ? "Looks close"
                        : candidate.assessment === "similar"
                          ? "Similar design"
                          : "Image result"}
                    </span>
                  </a>
                  <div className="visual-candidate-body">
                    <small>{candidate.source}</small>
                    <h3>{candidate.title}</h3>
                    <p>{candidate.reason}</p>
                    {candidate.price ? (
                      <div className="visual-price">
                        <strong>
                          {formatPrice(
                            candidate.price.priceMinor,
                            candidate.price.currency,
                          )}
                        </strong>
                        <span>
                          {candidate.price.evidenceType === "product_page"
                            ? "Price checked on page"
                            : "Search-reported asking price"}
                          {expired ? " · May have changed" : ""}
                        </span>
                      </div>
                    ) : (
                      <p className="visual-no-price">Check price with seller</p>
                    )}
                    <div className="visual-actions">
                      <a
                        className="text-link"
                        href={candidate.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View listing <ArrowUpRight size={14} />
                      </a>
                      {candidate.identity && (
                        <button
                          className="button dark small"
                          disabled={searching}
                          onClick={() =>
                            onChoose(visualCandidateKey(candidate.id))
                          }
                        >
                          Use this model
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <p className="visual-footnote">
              Meta search · Checked{" "}
              {new Date(result.checkedAt).toLocaleString()}. Prices belong to
              the pictured listings; your item may be a different model.
            </p>
          </>
        )}
        {!searching && (!result || expired || error) && (
          <button className="button primary" onClick={onSearch}>
            <Search size={16} />
            {result ? "Refresh image search" : "Search this photo"}
          </button>
        )}
        <p className="visual-footnote">
          Meta searches from your photo and compares it with product photos
          retrieved from stores.
        </p>
      </div>
    </dialog>
  );
}
