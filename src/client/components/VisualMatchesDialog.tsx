import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ImageOff,
  LoaderCircle,
  Search,
  X,
  Columns2,
} from "lucide-react";
import { formatPrice } from "../../shared/demo";
import type { Mode, Product } from "../../shared/scan";
import {
  visualCandidateKey,
  visualListingCondition,
  type VisualSearch,
  type VisualCandidate,
} from "../../shared/visual-search";

function modelName(candidate: VisualCandidate) {
  const identity = candidate.identity;
  return identity ? `${identity.brand} ${identity.model}` : candidate.title;
}
function listingDetail(candidate: VisualCandidate) {
  const size = candidate.title.match(
    /\b(\d{1,2}(?:\.\d)?)\s*(?:["″]|[- ]inch\b)/i,
  )?.[1];
  const refresh = candidate.title.match(/\b(\d{2,3})\s*Hz\b/i)?.[1];
  return [
    size ? `${Number(size)}″` : "",
    refresh ? `${refresh} Hz` : "",
    candidate.identity?.variant || "",
    visualListingCondition(candidate),
  ]
    .filter(Boolean)
    .join(" · ");
}
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
  const [inspecting, setInspecting] = useState<string | null>(null);
  const [failedPhotos, setFailedPhotos] = useState<Set<string>>(
    () => new Set(),
  );
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  useEffect(() => {
    setElapsed(0);
    if (!searching) return;
    const start = Date.now(),
      timer = setInterval(
        () => setElapsed(Math.floor((Date.now() - start) / 1000)),
        1000,
      );
    return () => clearInterval(timer);
  }, [searching]);
  const expired = Boolean(result && result.expiresAt <= Date.now());
  const compared =
    result?.candidates.filter((c) => c.assessment !== "unreviewed") || [];
  const other =
    result?.candidates.filter((c) => c.assessment === "unreviewed") || [];
  const imageOf = (src: string | undefined, alt: string) =>
    src && !failedPhotos.has(src) ? (
      <img
        src={src}
        alt={alt}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() =>
          setFailedPhotos((previous) => new Set([...previous, src]))
        }
      />
    ) : (
      <span className="visual-photo-missing">
        <ImageOff size={24} />
        <small>Photo unavailable</small>
      </span>
    );
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
          <span className="eyebrow">PHOTO MATCHES</span>
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
            <h2 id="visual-title">
              {compared.length ? "Compare the models." : "Find its match."}
            </h2>
            <p>{product.model || product.label}</p>
          </div>
        </div>
        <p className="visual-explainer">
          Check the model label before choosing. Similar designs can have
          different specifications.
        </p>
        {mode === "resale" && (
          <p className="result-note">
            Listing prices are not verified sold prices or a resale valuation.
          </p>
        )}
        <div aria-live="polite" aria-atomic="true">
          {searching ? (
            <div className="visual-loading">
              <LoaderCircle className="spin" size={20} />
              <div>
                <strong>
                  {elapsed < 15
                    ? "Finding models and comparing photos…"
                    : "Still checking product photos…"}
                </strong>
                <span>
                  {elapsed < 35
                    ? "You can close this and keep browsing."
                    : "Some stores are taking longer to respond."}
                  <span aria-hidden="true">
                    {elapsed > 0 ? ` · ${elapsed}s` : ""}
                  </span>
                </span>
              </div>
            </div>
          ) : error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : result && !compared.length ? (
            <p className="visual-empty">
              {other.length
                ? "Found related listings, but their photos could not be compared."
                : "No useful matches yet. Try a closer view or a readable model label."}
            </p>
          ) : null}
        </div>
        {result && (
          <>
            {compared.length > 0 && (
              <p className="visual-status">
                <strong>
                  {compared.length}{" "}
                  {compared.length === 1 ? "visual match" : "model options"}
                </strong>
                <span>Photos compared by Meta · Exact model unconfirmed</span>
              </p>
            )}
            <div className="visual-candidates">
              {compared.map((candidate) => (
                <article className="visual-candidate" key={candidate.id}>
                  <div className="visual-candidate-photo">
                    {imageOf(candidate.thumbnail, modelName(candidate))}
                    <span>
                      {candidate.assessment === "likely"
                        ? "Looks close"
                        : "Similar design"}
                    </span>
                  </div>
                  <div className="visual-candidate-body">
                    <small>{candidate.source}</small>
                    <h3>{modelName(candidate)}</h3>
                    {listingDetail(candidate) && (
                      <p className="visual-specs">
                        Listing: {listingDetail(candidate)}
                      </p>
                    )}
                    <p>
                      {candidate.reason.replace(
                        " Check the model label and specifications.",
                        "",
                      )}
                    </p>
                    {candidate.price ? (
                      <div className="visual-price">
                        <strong>
                          {formatPrice(
                            candidate.price.priceMinor,
                            candidate.price.currency,
                          )}
                        </strong>
                        <span>
                          {candidate.price.kind === "asking"
                            ? "Seller’s asking price"
                            : "Store price"}{" "}
                          ·{" "}
                          {candidate.price.evidenceType === "product_page"
                            ? "Checked on page"
                            : "Search result"}
                          {expired ? " · May have changed" : ""}
                        </span>
                      </div>
                    ) : (
                      <p className="visual-no-price">Price not verified</p>
                    )}
                    <div className="visual-actions">
                      {candidate.identity && (
                        <button
                          className="button dark small"
                          disabled={searching || expired}
                          onClick={() =>
                            onChoose(visualCandidateKey(candidate.id))
                          }
                        >
                          Use this model
                        </button>
                      )}
                      <a
                        className="text-link"
                        href={candidate.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View listing <ArrowUpRight size={14} />
                      </a>
                    </div>
                    {photo && candidate.thumbnail && (
                      <button
                        className="visual-compare-toggle"
                        aria-expanded={inspecting === candidate.id}
                        onClick={() =>
                          setInspecting(
                            inspecting === candidate.id ? null : candidate.id,
                          )
                        }
                      >
                        <Columns2 size={14} />
                        {inspecting === candidate.id
                          ? "Hide comparison"
                          : "Compare photos"}
                      </button>
                    )}
                  </div>
                  {inspecting === candidate.id && (
                    <div className="visual-photo-pair">
                      <figure>
                        {imageOf(photo, "Your original scan")}
                        <figcaption>Your scan</figcaption>
                      </figure>
                      <figure>
                        {imageOf(
                          candidate.thumbnail,
                          "Photo from the product listing",
                        )}
                        <figcaption>Listing photo</figcaption>
                      </figure>
                    </div>
                  )}
                </article>
              ))}
            </div>
            {other.length > 0 && (
              <details className="visual-other" open={!compared.length}>
                <summary>
                  {other.length} more{" "}
                  {other.length === 1 ? "listing" : "listings"}{" "}
                  <span>Photos not compared</span>
                </summary>
                <div>
                  {other.map((candidate) => (
                    <a
                      key={candidate.id}
                      href={candidate.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span>
                        <small>{candidate.source}</small>
                        <strong>{candidate.title}</strong>
                      </span>
                      <ArrowUpRight size={17} />
                    </a>
                  ))}
                </div>
              </details>
            )}
            <p className="visual-footnote">
              Checked {new Date(result.checkedAt).toLocaleString()}. Prices
              belong to the listed models; your item may differ.
            </p>
          </>
        )}
        {!searching && (!result || expired || error) && (
          <button className="button primary" onClick={onSearch}>
            <Search size={16} />
            {result ? "Search again" : "Search this photo"}
          </button>
        )}
        {!result && (
          <p className="visual-footnote">
            Meta searches from your photo and compares real product photos from
            stores.
          </p>
        )}
      </div>
    </dialog>
  );
}
