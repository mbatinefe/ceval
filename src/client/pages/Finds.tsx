import { useEffect, useState } from "react";
import { ArrowUpRight, Bookmark, Trash2, LoaderCircle } from "lucide-react";
import { formatPrice, type SavedFind } from "../../shared/demo";
import { api, ApiError } from "../lib/api";
import { ComparisonDialog } from "../components/ComparisonDialog";
import type { Comparison } from "../../shared/scan";
import { ProductDialog } from "../components/ProductDialog";
export function Finds() {
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [selectedComparison, setSelectedComparison] =
    useState<Comparison | null>(null);
  const [finds, setFinds] = useState<SavedFind[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<SavedFind | null>(null);
  useEffect(() => {
    let active = true;
    Promise.all([
      api<{ finds: SavedFind[] }>("/api/finds"),
      api<{ comparisons: Comparison[] }>("/api/comparisons"),
    ])
      .then(([data, results]) => {
        if (active) {
          setFinds(data.finds);
          setComparisons(results.comparisons);
        }
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401)
          window.location.assign("/signin");
        else if (active)
          setError("Couldn’t load your finds. Refresh to try again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function remove(id: string) {
    setBusy(id);
    setError("");
    try {
      await api(`/api/finds/${encodeURIComponent(id)}`, {}, "DELETE");
      setFinds(finds.filter((find) => find.id !== id));
    } catch {
      setError("Couldn’t remove this find. Please try again.");
    } finally {
      setBusy(null);
    }
  }
  return (
    <main className="content-page app-wrap">
      <div className="page-heading">
        <div>
          <span className="eyebrow">SAVED</span>
          <h1>
            Your finds<span className="accent">.</span>
          </h1>
          <p>Your comparisons, all in one place.</p>
        </div>
        <a className="button dark small" href="/app">
          Back to scanning <ArrowUpRight size={16} />
        </a>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {loading ? (
        <div className="empty-state">
          <LoaderCircle className="spin" />
          <p>Gathering your finds…</p>
        </div>
      ) : finds.length || comparisons.length ? (
        <>
          <p className="finds-summary">
            {comparisons.length} saved comparisons
            {finds.length ? ` · ${finds.length} earlier demo finds` : ""}
          </p>
          {comparisons.length > 0 && (
            <div className="finds-grid">
              {comparisons.map((comparison) => (
                <article className="comparison-find" key={comparison.id}>
                  <span className="eyebrow">
                    {comparison.mode === "buy"
                      ? "ONLINE COMPARISON"
                      : "RESALE LISTINGS"}
                  </span>
                  <h2>
                    {comparison.product.brand} {comparison.product.model}
                  </h2>
                  <p>{comparison.product.variant}</p>
                  <p>
                    {comparison.offers.length} sourced listings ·{" "}
                    {new Date(comparison.checkedAt).toLocaleDateString()}
                  </p>
                  <div className="find-actions">
                    <button onClick={() => setSelectedComparison(comparison)}>
                      Review sources <ArrowUpRight size={16} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Remove comparison ${comparison.product.model}`}
                      disabled={busy !== null}
                      onClick={async () => {
                        setBusy(comparison.id);
                        try {
                          await api(
                            `/api/comparisons/${comparison.id}`,
                            {},
                            "DELETE",
                          );
                          setComparisons((rows) =>
                            rows.filter((row) => row.id !== comparison.id),
                          );
                        } catch {
                          setError("Couldn’t remove this comparison.");
                        } finally {
                          setBusy(null);
                        }
                      }}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
          <div className="finds-grid">
            {finds.map((find) => (
              <article className="find-card" key={find.id}>
                <div className={`find-art art-${find.product.id}`}>
                  <img
                    src="/demo/electronics-shelf.png"
                    alt={`${find.product.brand} ${find.product.model} in the sample scene`}
                  />
                  <span className="pill">DEMO FIND</span>
                </div>
                <div className="find-card-body">
                  <small>
                    {find.product.brand} ·{" "}
                    {find.mode === "buy" ? "Buy cheaper" : "Resale value"}
                  </small>
                  <h2>{find.product.model}</h2>
                  <div className="find-price">
                    <strong>{formatPrice(find.product.storePriceMinor)}</strong>
                    <span>Example shelf price</span>
                  </div>
                  <div className="find-actions">
                    <button onClick={() => setSelected(find)}>
                      Look closer <ArrowUpRight size={16} />
                    </button>
                    <button
                      className="icon-button"
                      onClick={() => remove(find.id)}
                      disabled={busy !== null}
                      aria-label={`Remove ${find.product.model}`}
                    >
                      {busy === find.id ? (
                        <LoaderCircle className="spin" size={17} />
                      ) : (
                        <Trash2 size={17} />
                      )}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : (
        !error && (
          <div className="empty-state">
            <span className="empty-icon">
              <Bookmark size={32} />
            </span>
            <h2>No saved finds yet.</h2>
            <p>
              Save a sourced comparison while scanning.
              <br />
              It’ll be waiting right here when you come back.
            </p>
            <a href="/app" className="button primary">
              Open scanner <ArrowUpRight size={18} />
            </a>
          </div>
        )
      )}
      {selectedComparison && (
        <ComparisonDialog
          comparison={selectedComparison}
          onClose={() => setSelectedComparison(null)}
        />
      )}
      {selected && (
        <ProductDialog
          product={selected.product}
          mode={selected.mode}
          onClose={() => setSelected(null)}
        />
      )}
    </main>
  );
}
