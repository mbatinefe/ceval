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
          <span className="eyebrow">YOUR CURIOSITY, IN FOCUS</span>
          <h1>
            See what’s <em>here.</em>
          </h1>
          <p>
            Open your camera or choose a video. Start with a clear product
            label.
          </p>
        </div>
        <label className="market-select">
          Shopping market
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
                maxWidth: "100%",
                maxHeight: "100%",
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
                <h2>A new way to look.</h2>
                <p>
                  Point at a product or bring a video.
                  <br />
                  We’ll look for the exact model and its price elsewhere.
                </p>
                <button className="text-link" onClick={scan.sample}>
                  <Film size={17} />
                  Try the generated store footage
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
              <strong>Camera and video preview are ready.</strong>
              <p>
                {scan.capabilities.reason} No recognition or price searches will
                run until analysis is connected.
              </p>
            </div>
          )}
          <p className="media-privacy">
            When you start scanning, selected frames are sent to Meta for
            product analysis. The full video stays on your device. Ceval does
            not save your frames. Videos: up to 150 MB and 10 minutes.
          </p>
        </section>
        <aside className="scan-results">
          <div className="results-heading">
            <span className="eyebrow">FOUND ALONG THE WAY</span>
            <span>{String(scan.found.length).padStart(2, "0")}</span>
          </div>
          {scan.found.length === 0 ? (
            <div className="results-empty">
              <Tag size={25} />
              <h2>Every find starts with a look.</h2>
              <p>
                Identified products and sourced comparisons will appear here.
                Labels that can’t be read won’t get a guessed price.
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
