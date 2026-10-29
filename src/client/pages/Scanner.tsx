import { useRef, useState } from "react";
import {
  Camera,
  Upload,
  Play,
  Square,
  Tag,
  TrendingUp,
  Film,
  ScanLine,
  LoaderCircle,
  ArrowUpRight,
  X,
} from "lucide-react";
import {
  markets,
  type Comparison,
  type Market,
  type Mode,
} from "../../shared/scan";
import { formatPrice } from "../../shared/demo";
import { ComparisonDialog } from "../components/ComparisonDialog";
import { useScanner } from "../scanner/useScanner";
import { clips } from "../../../public/demo/manifest.json";
export function Scanner() {
  const [mode, setMode] = useState<Mode>("buy"),
    [market, setMarket] = useState<Market>("US"),
    [selected, setSelected] = useState<Comparison | null>(null);
  const upload = useRef<HTMLInputElement>(null),
    scan = useScanner(mode, market);
  return (
    <main className="live-scanner app-wrap">
      <div className="scanner-heading">
        <div>
          <span className="eyebrow">YOUR FIELD OF VIEW</span>
          <h1>
            Look closer<span className="accent">.</span>
          </h1>
        </div>
        <label className="market-select">
          Market
          <select
            value={market}
            onChange={(e) => setMarket(e.target.value as Market)}
          >
            {Object.entries(markets).map(([code, value]) => (
              <option key={code} value={code}>
                {value.name} · {value.currency}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="scanner-toolbar">
        <div className="mode-switch" role="group" aria-label="Comparison mode">
          <button aria-pressed={mode === "buy"} onClick={() => setMode("buy")}>
            <Tag size={17} />
            Buy cheaper
          </button>
          <button
            aria-pressed={mode === "resale"}
            onClick={() => setMode("resale")}
          >
            <TrendingUp size={17} />
            Resale value
          </button>
        </div>
        <div className="source-buttons">
          <button
            className="button dark small"
            onClick={() => void scan.camera()}
          >
            <Camera size={17} />
            Use camera
          </button>
          <button
            className="button outline small"
            onClick={() => upload.current?.click()}
          >
            <Upload size={17} />
            Choose video
          </button>
          <input
            ref={upload}
            type="file"
            accept="video/*,.mov,.mp4,.m4v,.webm"
            hidden
            aria-label="Choose a video"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) scan.chooseVideo(file);
              e.target.value = "";
            }}
          />
        </div>
      </div>
      <div className="scanner-grid">
        <section className="media-panel" aria-label="Video scanner">
          <div
            className={`live-stage ${scan.source ? "has-source" : ""}`}
            style={{ aspectRatio: Math.max(0.56, Math.min(1.78, scan.aspect)) }}
          >
            <div
              className="video-surface"
              style={{
                aspectRatio: scan.aspect,
                width: `min(100%, calc(var(--view-height) * ${scan.aspect}))`,
              }}
            >
              <video
                ref={scan.video}
                className="user-video"
                muted
                playsInline
                controls={scan.source !== "camera"}
                preload="metadata"
                onLoadedMetadata={scan.loaded}
                onSeeking={scan.invalidatePosition}
                onEnded={scan.ended}
                onError={() => {
                  if (scan.source) {
                    scan.closeSource();
                    scan.setError(
                      "This browser can’t play that video. Try an MP4 encoded with H.264.",
                    );
                  }
                }}
                aria-label={
                  scan.sourceName || "Camera or uploaded video preview"
                }
              />
              <div className="live-pins">
                {scan.pins.map((product, index) => (
                  <button
                    key={product.id}
                    className="live-pin"
                    style={{
                      left: `${(product.box.x + product.box.width / 2) * 100}%`,
                      top: `${(product.box.y + product.box.height / 2) * 100}%`,
                    }}
                    aria-label={`Inspect ${product.label}`}
                    onClick={() => {
                      const row = scan.found.find(
                        (r) => r.product.id === product.id,
                      );
                      if (row?.comparison) setSelected(row.comparison);
                      else
                        document
                          .getElementById(`result-${product.id}`)
                          ?.scrollIntoView({
                            behavior: "smooth",
                            block: "center",
                          });
                    }}
                  >
                    {index + 1}
                    <span>{product.model || product.label}</span>
                  </button>
                ))}
              </div>
            </div>
            {!scan.source && (
              <div className="source-empty">
                <span className="empty-scan-icon">
                  <ScanLine size={36} />
                </span>
                <span className="viewfinder-corner top-left" />
                <span className="viewfinder-corner top-right" />
                <span className="viewfinder-corner bottom-left" />
                <span className="viewfinder-corner bottom-right" />
                <h2>Worth a closer look.</h2>
                <p>Your camera. A video. A new find.</p>
                <button
                  className="button primary"
                  onClick={() => void scan.camera()}
                >
                  <Camera size={18} /> Open camera
                </button>
                <button className="text-link" onClick={() => scan.sample()}>
                  <Film size={16} /> Try a sample instead{" "}
                  <ArrowUpRight size={15} />
                </button>
              </div>
            )}
            {scan.source && (
              <div className="input-label">
                <span>
                  <i />
                  {scan.source === "camera"
                    ? "LIVE CAMERA"
                    : scan.source === "sample"
                      ? "GENERATED TEST FOOTAGE"
                      : "YOUR VIDEO"}
                </span>
                <button
                  aria-label="Close video source"
                  onClick={scan.closeSource}
                >
                  <X size={17} />
                </button>
              </div>
            )}
          </div>
          <div className="scan-actions">
            <div className="scan-status" role="status">
              {scan.busy ? (
                <LoaderCircle size={18} className="spin" />
              ) : (
                <span
                  className={`status-dot ${scan.running ? "active" : ""}`}
                />
              )}
              <span>{scan.message}</span>
            </div>
            {scan.running || scan.finishing ? (
              <button className="button dark small" onClick={scan.stopAnalysis}>
                <Square size={15} />
                {scan.finishing ? "Cancel remaining" : "Stop scanning"}
              </button>
            ) : (
              <button
                className="button primary small"
                disabled={!scan.ready || !scan.capabilities?.analysisAvailable}
                onClick={() => void scan.start()}
              >
                <Play size={16} />
                Start scanning
              </button>
            )}
          </div>
          {scan.error && (
            <p role="alert" className="form-error scanner-error">
              {scan.error}
            </p>
          )}
          {scan.capabilities && !scan.capabilities.analysisAvailable && (
            <div className="availability-note">
              <span className="status-dot" />
              <p>
                Preview mode. Recognition and price search are not connected
                yet.
              </p>
            </div>
          )}
          <details className="media-privacy">
            <summary>Video & privacy</summary>
            <p>
              Up to 150 MB · 10 minutes. Your video stays on this device. When
              scanning, selected frames go to Meta for analysis; Ceval does not
              save them.
            </p>
          </details>
        </section>
        <aside className="scan-results">
          <div className="results-heading">
            <span className="eyebrow">YOUR FINDS</span>
            <span>{String(scan.found.length).padStart(2, "0")}</span>
          </div>
          {scan.found.length === 0 ? (
            <div className="results-empty">
              <Tag size={25} />
              <h2>Nothing in view.</h2>
              <p>
                Scan a clear model label. Your products and comparisons will
                appear here.
              </p>
            </div>
          ) : (
            scan.found.map((row) => (
              <article
                className="scan-result"
                key={row.product.id}
                id={`result-${row.product.id}`}
              >
                <small>
                  {row.product.brand || "Product"}
                  {scan.source !== "camera"
                    ? ` · ${Math.floor(row.time / 60)}:${String(Math.floor(row.time % 60)).padStart(2, "0")}`
                    : ""}
                </small>
                <h2>{row.product.model || row.product.label}</h2>
                <p>{row.product.variant}</p>
                {row.searching ? (
                  <p className="searching-price">
                    <LoaderCircle size={14} className="spin" />
                    Searching matching listings…
                  </p>
                ) : row.error ? (
                  <p className="result-note">{row.error}</p>
                ) : row.comparison ? (
                  <>
                    <p className="result-price">
                      {row.comparison.offers.length
                        ? `${row.comparison.offers.length} sourced ${row.comparison.mode === "buy" ? "offers" : "listings"}`
                        : "No supported offers found"}
                    </p>
                    {row.comparison.offers[0] && (
                      <small>
                        Lowest listed:{" "}
                        {formatPrice(
                          row.comparison.offers[0].priceMinor,
                          row.comparison.offers[0].currency,
                        )}
                      </small>
                    )}
                    <button
                      className="text-link"
                      onClick={() => setSelected(row.comparison!)}
                    >
                      Review sources
                      <ArrowUpRight size={16} />
                    </button>
                  </>
                ) : (
                  <p className="result-note">Waiting for price comparison.</p>
                )}
              </article>
            ))
          )}
          <a href="/app/finds" className="shelf-link">
            Your saved finds
            <ArrowUpRight size={16} />
          </a>
        </aside>
      </div>
      <details className="sample-library">
        <summary>
          <span>
            <Film size={16} /> Sample library
          </span>
          <small>{clips.length} synthetic clips +</small>
        </summary>
        <p>
          Generated scenes with pans and zooms. Prices on labels are fictional.
        </p>
        <div className="sample-grid">
          {clips.map((clip) => (
            <button
              className="sample-card"
              key={clip.id}
              onClick={() => {
                scan.sample(clip);
                document
                  .querySelector(".live-stage")
                  ?.scrollIntoView({ block: "center", behavior: "smooth" });
              }}
            >
              <img src={clip.poster} alt={clip.title} loading="lazy" />
              <span>
                <strong>{clip.title}</strong>
                <small>
                  {clip.description} · {clip.seconds}s
                </small>
              </span>
            </button>
          ))}
        </div>
      </details>
      {selected && (
        <ComparisonDialog
          key={selected.id}
          comparison={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </main>
  );
}
