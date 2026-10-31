import { VisualMatchesDialog } from "../components/VisualMatchesDialog";
import {
  visualSearchForMarket,
  type VisualSearch,
} from "../../shared/visual-search";
import { scanRequest } from "../scanner/media";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Bookmark,
  Camera,
  Trash2,
  LoaderCircle,
} from "lucide-react";
import { formatPrice, type SavedFind } from "../../shared/demo";
import { api, ApiError } from "../lib/api";
import { ComparisonDialog } from "../components/ComparisonDialog";
import {
  markets,
  type Comparison,
  type Market,
  type Product,
} from "../../shared/scan";
import { ProductDialog } from "../components/ProductDialog";
import { ModelChoiceDialog } from "../components/ModelChoiceDialog";
import type { ScanHistoryEntry } from "../../shared/history";
import { offerSummary } from "../scanner/presentation";
export function Finds() {
  const [visualEntry, setVisualEntry] = useState<ScanHistoryEntry | null>(null);
  const [visualError, setVisualError] = useState("");
  const [history, setHistory] = useState<ScanHistoryEntry[]>([]);
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [selectedComparison, setSelectedComparison] =
    useState<Comparison | null>(null);
  const [finds, setFinds] = useState<SavedFind[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<SavedFind | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [choosing, setChoosing] = useState<ScanHistoryEntry | null>(null);
  const [selectedMarkets, setSelectedMarkets] = useState<
    Record<string, Market>
  >({});
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.allSettled([
      api<{ entries: ScanHistoryEntry[] }>("/api/scan/history"),
      api<{ finds: SavedFind[] }>("/api/finds"),
      api<{ comparisons: Comparison[] }>("/api/comparisons"),
    ])
      .then(([recent, data, results]) => {
        if (!active) return;
        if (recent.status === "fulfilled") setHistory(recent.value.entries);
        if (data.status === "fulfilled") setFinds(data.value.finds);
        if (results.status === "fulfilled")
          setComparisons(results.value.comparisons);
        const failures = [recent, data, results].filter(
          (result) => result.status === "rejected",
        );
        if (
          failures.some(
            (result) =>
              result.reason instanceof ApiError && result.reason.status === 401,
          )
        ) {
          window.location.assign("/signin");
        } else if (failures.length) {
          setError(
            "Couldn’t load all your finds. Try again to retrieve the rest.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadAttempt]);
  function replaceHistory(entry: ScanHistoryEntry, previousId: string) {
    setHistory((rows) =>
      [
        entry,
        ...rows.filter(
          (row) =>
            row.id !== previousId &&
            row.id !== entry.id &&
            !(
              row.product.id === entry.product.id && row.source === entry.source
            ),
        ),
      ].sort((a, b) => b.updatedAt - a.updatedAt),
    );
  }
  async function searchHistory(entry: ScanHistoryEntry, candidateKey?: string) {
    const market =
      selectedMarkets[entry.id] ??
      entry.market ??
      entry.comparison?.market ??
      "US";
    if (!market) return;
    setBusy(`search:${entry.id}`);
    setError("");
    let current = entry;
    try {
      if (candidateKey) {
        const { product } = await api<{ product: Product }>(
          "/api/scan/select-model",
          { productId: entry.product.id, candidateKey, market },
        );
        const saved = await api<{ entry: ScanHistoryEntry }>(
          "/api/scan/history",
          {
            id: entry.id,
            productId: product.id,
            source: entry.source,
            mode: entry.mode,
          },
        );
        current = saved.entry;
        replaceHistory(current, entry.id);
      }
      const comparison = await api<Comparison>("/api/scan/compare", {
        productId: current.product.id,
        mode: entry.mode,
        market,
      });
      const saved = await api<{ entry: ScanHistoryEntry }>(
        "/api/scan/history",
        {
          id: current.id,
          productId: current.product.id,
          comparisonId: comparison.id,
          source: current.source,
          mode: current.mode,
        },
      );
      replaceHistory(saved.entry, current.id);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Couldn’t search prices for this find. Please try again.",
      );
    } finally {
      setBusy(null);
    }
  }
  async function searchImage(entry: ScanHistoryEntry) {
    setBusy(`visual:${entry.id}`);
    setVisualError("");
    try {
      const visualSearch = await scanRequest<VisualSearch>(
        "/api/scan/visual-matches",
        {
          productId: entry.product.id,
          market: selectedMarkets[entry.id] ?? entry.market ?? "US",
        },
        new AbortController().signal,
      );
      setHistory((rows) =>
        rows.map((row) =>
          row.id === entry.id && row.product.id === entry.product.id
            ? { ...row, visualSearch }
            : row,
        ),
      );
      setVisualEntry((current) =>
        current?.id === entry.id && current.product.id === entry.product.id
          ? { ...current, visualSearch }
          : current,
      );
    } catch (error) {
      setVisualError(
        error instanceof Error
          ? error.message
          : "Image search could not finish.",
      );
    } finally {
      setBusy(null);
    }
  }
  function showMatches(entry: ScanHistoryEntry) {
    setVisualError("");
    const result = visualSearchForMarket(
      entry.visualSearch,
      selectedMarkets[entry.id] ?? entry.market ?? "US",
    );
    setVisualEntry({ ...entry, visualSearch: result });
    if (!result) void searchImage(entry);
  }
  async function removeHistory(id?: string) {
    setBusy(id ? `history:${id}` : "history:all");
    setError("");
    try {
      await api(
        `/api/scan/history${id ? `/${encodeURIComponent(id)}` : ""}`,
        {},
        "DELETE",
      );
      setHistory((rows) => (id ? rows.filter((row) => row.id !== id) : []));
    } catch {
      setError("Couldn’t remove scan history. Please try again.");
    } finally {
      setBusy(null);
    }
  }
  async function remove(id: string) {
    setBusy(id);
    setError("");
    try {
      await api(`/api/finds/${encodeURIComponent(id)}`, {}, "DELETE");
      setFinds((rows) => rows.filter((find) => find.id !== id));
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
          <span className="eyebrow">YOUR SCANS</span>
          <h1>
            Your finds<span className="accent">.</span>
          </h1>
          <p>Recent products and photos, remembered as you scan.</p>
        </div>
        <a className="button dark small" href="/app">
          Back to scanning <ArrowUpRight size={16} />
        </a>
      </div>
      {error && (
        <div className="history-error">
          <p role="alert" className="form-error">
            {error}
          </p>
          <button
            className="button dark small"
            disabled={loading}
            onClick={() => setLoadAttempt((attempt) => attempt + 1)}
          >
            Try again
          </button>
        </div>
      )}
      {loading ? (
        <div className="empty-state">
          <LoaderCircle className="spin" />
          <p>Gathering your finds…</p>
        </div>
      ) : history.length || finds.length || comparisons.length ? (
        <>
          {history.length > 0 && (
            <section
              className="history-section"
              aria-labelledby="history-heading"
            >
              <div className="history-heading">
                <div>
                  <h2 id="history-heading">Recent scans</h2>
                  <p className="finds-summary">
                    {history.length} recent finds · Up to 100 remembered
                    automatically.
                  </p>
                </div>
                <button
                  className="button dark small"
                  disabled={busy !== null}
                  onClick={() => removeHistory()}
                >
                  <Trash2 size={15} /> Clear scan history
                </button>
              </div>
              <div className="finds-grid">
                {history.map((entry) => {
                  const product = entry.product;
                  const uncertain =
                    !product.model ||
                    Boolean(product.candidates?.length) ||
                    (product.confidence < 0.85 &&
                      product.identification !== "user_selected");
                  const comparison = entry.comparison;
                  const summary = offerSummary(comparison, {
                    includeExpired: true,
                  });
                  const market =
                    selectedMarkets[entry.id] ??
                    entry.market ??
                    comparison?.market;
                  const searching = busy === `search:${entry.id}`;
                  const hasCandidates = Boolean(product.candidates?.length);
                  const source =
                    entry.source === "sample"
                      ? "SIMULATED SAMPLE"
                      : entry.source === "video"
                        ? "YOUR VIDEO"
                        : "CAMERA";
                  return (
                    <article className="find-card history-card" key={entry.id}>
                      <div className="find-art history-photo">
                        {entry.thumbnailUrl ? (
                          <img
                            src={entry.thumbnailUrl}
                            alt={`${product.brand} ${product.model || product.label} when scanned`}
                            loading="lazy"
                          />
                        ) : (
                          <div className="history-no-photo">
                            <Camera size={28} />
                            <span>Photo unavailable</span>
                          </div>
                        )}
                        <span className="pill">{source}</span>
                      </div>
                      <div className="find-card-body">
                        <small>{product.brand || "Unidentified brand"}</small>
                        <h2>{product.model || product.label}</h2>
                        {product.variant && (
                          <p className="history-variant">{product.variant}</p>
                        )}
                        {!comparison && (
                          <time
                            className="history-time"
                            dateTime={new Date(entry.updatedAt).toISOString()}
                          >
                            Updated {new Date(entry.updatedAt).toLocaleString()}
                          </time>
                        )}
                        {(!summary || searching) && (
                          <p className="history-result">
                            {searching
                              ? "Confirming model and searching prices…"
                              : uncertain
                                ? hasCandidates
                                  ? "Choose your model to search prices."
                                  : "Model unconfirmed · search by photo to find matches."
                                : comparison
                                  ? comparison.offers.length
                                    ? `${comparison.offers.length} sourced listings`
                                    : comparison.sources?.length
                                      ? `${comparison.sources.length} related product pages · price unverified`
                                      : "No supported prices found."
                                  : "Detected · no price result yet."}
                          </p>
                        )}
                        {summary && (
                          <div className="history-price">
                            <strong>
                              {formatPrice(
                                summary.offer.priceMinor,
                                summary.offer.currency,
                              )}
                            </strong>
                            <span>
                              {summary.offer.kind === "asking"
                                ? "Asking price"
                                : summary.offer.kind === "sold"
                                  ? "Reported completed sale"
                                  : summary.offer.evidenceType ===
                                      "cited_summary"
                                    ? "Search-reported retail price"
                                    : "Retail price"}
                            </span>
                            {summary.qualification && (
                              <small>{summary.qualification}</small>
                            )}
                          </div>
                        )}
                        {comparison && (
                          <p className="history-time">
                            Checked{" "}
                            {new Date(comparison.checkedAt).toLocaleString()}
                            {comparison.expiresAt <= Date.now()
                              ? " · Saved price, may have changed"
                              : ""}
                          </p>
                        )}
                        {product.shelfPriceMinor !== null &&
                          product.shelfCurrency && (
                            <p className="history-shelf">
                              Observed shelf label:{" "}
                              {formatPrice(
                                product.shelfPriceMinor,
                                product.shelfCurrency,
                              )}
                            </p>
                          )}
                        {!entry.market &&
                          !comparison?.market &&
                          (hasCandidates || !uncertain) && (
                            <label className="history-market">
                              Shopping market
                              <select
                                value={selectedMarkets[entry.id] ?? ""}
                                onChange={(event) =>
                                  setSelectedMarkets((values) => ({
                                    ...values,
                                    [entry.id]: event.target.value as Market,
                                  }))
                                }
                                disabled={busy !== null}
                              >
                                <option value="" disabled>
                                  Choose a market
                                </option>
                                {Object.entries(markets).map(
                                  ([code, value]) => (
                                    <option key={code} value={code}>
                                      {value.name}
                                    </option>
                                  ),
                                )}
                              </select>
                            </label>
                          )}
                        {entry.thumbnailUrl && (
                          <button
                            className="button dark small history-search"
                            disabled={busy !== null}
                            onClick={() => showMatches(entry)}
                          >
                            {entry.visualSearch
                              ? "View photo matches"
                              : "Find image matches"}
                            <ArrowUpRight size={15} />
                          </button>
                        )}
                        {(hasCandidates || !uncertain) && (
                          <button
                            className={
                              comparison
                                ? "text-link history-search secondary-search"
                                : "button dark small history-search"
                            }
                            disabled={busy !== null || !market}
                            onClick={() =>
                              hasCandidates
                                ? setChoosing(entry)
                                : searchHistory(entry)
                            }
                          >
                            {searching ? (
                              <>
                                <LoaderCircle className="spin" size={14} />{" "}
                                Searching…
                              </>
                            ) : hasCandidates ? (
                              "Choose model"
                            ) : comparison ? (
                              "Refresh prices"
                            ) : (
                              "Search prices"
                            )}
                          </button>
                        )}
                        <div className="find-actions">
                          {comparison ? (
                            <button
                              onClick={() =>
                                setSelectedComparison({
                                  ...comparison,
                                  saved: comparisons.some(
                                    (saved) => saved.id === comparison.id,
                                  ),
                                })
                              }
                            >
                              {comparison.offers.length
                                ? "View prices"
                                : comparison.sources?.length
                                  ? "See product pages"
                                  : "Search options"}{" "}
                              <ArrowUpRight size={16} />
                            </button>
                          ) : (
                            <a className="text-link" href="/app">
                              Scan again <ArrowUpRight size={16} />
                            </a>
                          )}
                          <button
                            className="icon-button"
                            aria-label={`Remove scan of ${product.model || product.label}`}
                            disabled={busy !== null}
                            onClick={() => removeHistory(entry.id)}
                          >
                            {busy === `history:${entry.id}` ? (
                              <LoaderCircle className="spin" size={17} />
                            ) : (
                              <Trash2 size={17} />
                            )}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}
          {(comparisons.length > 0 || finds.length > 0) && (
            <h2 className="saved-finds-heading">Saved comparisons</h2>
          )}
          {(comparisons.length > 0 || finds.length > 0) && (
            <p className="finds-summary">
              {comparisons.length} saved comparisons
              {finds.length ? ` · ${finds.length} earlier demo finds` : ""}
            </p>
          )}
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
            <h2>No finds yet.</h2>
            <p>
              Products and their photos appear here as you scan.
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
      {visualEntry && (
        <VisualMatchesDialog
          product={visualEntry.product}
          photo={visualEntry.thumbnailUrl}
          result={visualEntry.visualSearch}
          searching={busy === `visual:${visualEntry.id}`}
          error={visualError}
          mode={visualEntry.mode}
          onSearch={() => void searchImage(visualEntry)}
          onChoose={(key) => {
            setVisualEntry(null);
            void searchHistory(visualEntry, key);
          }}
          onClose={() => setVisualEntry(null)}
        />
      )}
      {choosing && (
        <ModelChoiceDialog
          product={choosing.product}
          onClose={() => setChoosing(null)}
          onChoose={(key) => {
            setChoosing(null);
            void searchHistory(choosing, key);
          }}
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
