import { useRef, useState } from "react";
import {
  Camera,
  CameraOff,
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
import { ModelChoiceDialog } from "../components/ModelChoiceDialog";
import { ScanResultCard } from "../components/ScanResultCard";
import { offerSummary } from "../scanner/presentation";
import { isAllowanceError } from "../scanner/state";
import { useScanner, type FoundProduct } from "../scanner/useScanner";
import { clips } from "../../../public/demo/manifest.json";
export function Scanner() {
  const [mode, setMode] = useState<Mode>("buy"),
    [market, setMarket] = useState<Market>("US"),
    [selected, setSelected] = useState<Comparison | null>(null);
  const upload = useRef<HTMLInputElement>(null),
    scan = useScanner(mode, market);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [choiceKey, setChoiceKey] = useState<string | null>(null);
  const resumeAfterDetails = useRef(false);
  const rowKey = (row: FoundProduct) => row.rowId || row.product.id;
  const focused =
    scan.found.find((row) => rowKey(row) === focusedKey) ||
    scan.found.find((row) =>
      scan.pins.some((pin) => pin.id === row.product.id),
    ) ||
    scan.found[0];
  const choice = scan.found.find((row) => rowKey(row) === choiceKey);
  const allowanceNotice = scan.found.find((row) =>
    isAllowanceError(row.errorCode),
  )?.error;
  function pauseForDetails() {
    resumeAfterDetails.current = Boolean(
      scan.video.current && !scan.video.current.paused,
    );
    scan.video.current?.pause();
  }
  function closeDetails() {
    setSelected(null);
    setChoiceKey(null);
    if (resumeAfterDetails.current && scan.running)
      void scan.video.current?.play().catch(() => {
        scan.setError("Tap the video to resume playback.");
      });
    resumeAfterDetails.current = false;
  }
  function review(comparison: Comparison) {
    pauseForDetails();
    setSelected(comparison);
  }
  function choose(row: FoundProduct) {
    pauseForDetails();
    setChoiceKey(rowKey(row));
  }
  return (
    <main className={`live-scanner app-wrap${scan.source ? " has-feed" : ""}`}>
      <div className="scanner-heading">
        <div>
          <span className="eyebrow">
            {scan.source ? "YOUR FIELD OF VIEW" : "CEVAL SCANNER"}
          </span>
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
            disabled={scan.cameraPending}
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
      {!scan.source && (
        <p className="source-consent">
          Choose a camera or video to start. Selected frames go to Meta; your
          video stays on your device.
        </p>
      )}
      {(scan.cameraPending || scan.cameraProblem) && (
        <div
          className="camera-notice"
          role={scan.cameraProblem ? "alert" : "status"}
        >
          {scan.cameraPending ? (
            <LoaderCircle size={21} className="spin" />
          ) : (
            <CameraOff size={21} />
          )}
          <div>
            <strong>
              {scan.cameraProblem?.title || "Waiting for camera permission"}
            </strong>
            <p>
              {scan.cameraProblem?.detail ||
                "Respond to your browser’s camera permission request to continue. You can choose a video instead."}
            </p>
            <div className="camera-recovery-actions">
              {scan.cameraPending ? (
                <button
                  className="button outline small"
                  onClick={scan.closeSource}
                >
                  Cancel camera request
                </button>
              ) : (
                <button
                  className="button dark small"
                  onClick={() => void scan.camera()}
                >
                  <Camera size={16} /> Retry camera
                </button>
              )}
              <button
                className="button outline small"
                onClick={() => upload.current?.click()}
              >
                <Upload size={16} /> Choose video
              </button>
            </div>
          </div>
        </div>
      )}
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
                preload="auto"
                onLoadedMetadata={scan.loaded}
                onLoadedData={scan.loaded}
                onCanPlay={scan.loaded}
                onDurationChange={scan.loaded}
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
                {scan.pins.map((product, index) => {
                  const row = scan.found.find(
                    (item) => item.product.id === product.id,
                  );
                  const summary = offerSummary(row?.comparison);
                  return (
                    <button
                      key={product.id}
                      className={`live-pin${row && focused && rowKey(row) === rowKey(focused) ? " is-active" : ""}`}
                      style={{
                        left: `clamp(78px, ${(product.box.x + product.box.width / 2) * 100}%, calc(100% - 78px))`,
                        top: `${Math.max(0.12, Math.min(0.85, product.box.y + product.box.height / 2)) * 100}%`,
                      }}
                      aria-label={`Inspect ${product.model || product.label}`}
                      onClick={() => {
                        if (row) setFocusedKey(rowKey(row));
                      }}
                    >
                      <i>{index + 1}</i>
                      <span>
                        <strong>
                          {summary
                            ? formatPrice(
                                summary.offer.priceMinor,
                                summary.offer.currency,
                              )
                            : product.model || "Identify item"}
                        </strong>
                        <small>
                          {summary
                            ? [summary.shortLabel, summary.qualification]
                                .filter(Boolean)
                                .join(" · ")
                            : row?.searching
                              ? "Checking prices"
                              : product.candidates?.length
                                ? "Choose model"
                                : "Tap to inspect"}
                        </small>
                      </span>
                    </button>
                  );
                })}
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
                  disabled={scan.cameraPending}
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
          {scan.source === "camera" && scan.previewBlocked && (
            <div className="scan-actions">
              <p className="scan-status" role="status">
                Camera access is allowed. Your browser needs a tap to play the
                preview.
              </p>
              <button
                className="button primary small"
                onClick={() => void scan.playCameraPreview()}
              >
                <Play size={16} /> Play camera preview
              </button>
            </div>
          )}
          <div className="scan-actions">
            <div className="scan-status" role="status">
              {scan.busy ||
              scan.startupState === "starting" ||
              scan.startupState === "waiting" ? (
                <LoaderCircle size={18} className="spin" />
              ) : (
                <span
                  className={`status-dot ${scan.running ? "active" : ""}`}
                />
              )}
              <span>{scan.message}</span>
            </div>
            {scan.running ||
            scan.finishing ||
            scan.startupState === "waiting" ||
            scan.startupState === "starting" ? (
              <button
                className="button dark small"
                onClick={() => {
                  scan.stopAnalysis();
                  scan.video.current?.pause();
                }}
              >
                <Square size={15} />
                {scan.finishing
                  ? "Cancel remaining"
                  : scan.running
                    ? "Pause scan"
                    : "Cancel start"}
              </button>
            ) : (
              <button
                className="button primary small"
                disabled={
                  !scan.prepared || !scan.capabilities?.analysisAvailable
                }
                onClick={() => void scan.start()}
              >
                <Play size={16} />
                {scan.startupState === "blocked"
                  ? "Tap to start scanning"
                  : "Start scanning"}
              </button>
            )}
          </div>
          {focused && (
            <ScanResultCard
              row={focused}
              compact
              context={
                scan.pins.some((pin) => pin.id === focused.product.id)
                  ? "IN VIEW"
                  : rowKey(focused) === focusedKey
                    ? "SELECTED FIND"
                    : "RECENT FIND"
              }
              onChoose={() => choose(focused)}
              onReview={review}
              onRetry={
                focused.retryable
                  ? () =>
                      scan.retryComparison(focused.product.id, focused.rowId)
                  : undefined
              }
            />
          )}
          {scan.error && (
            <p role="alert" className="form-error scanner-error">
              {scan.error}
            </p>
          )}
          {scan.capabilities && !scan.capabilities.analysisAvailable && (
            <div className="availability-note">
              <span className="status-dot" />
              <p>{scan.capabilities.reason}</p>
            </div>
          )}
          <details className="media-privacy">
            <summary>Video & privacy</summary>
            <p>
              Up to 150 MB · 10 minutes. Choosing a source starts scanning when
              it is ready. Your full video stays on this device; selected frames
              go to Meta for analysis. Ceval does not save those frames.
            </p>
          </details>
        </section>
        <aside className="scan-results">
          <div className="results-heading">
            <span className="eyebrow">YOUR FINDS</span>
            <span>{String(scan.found.length).padStart(2, "0")}</span>
          </div>
          {allowanceNotice && (
            <p className="results-notice" role="status">
              {allowanceNotice}
            </p>
          )}
          {scan.found.length === 0 ? (
            <div className="results-empty">
              <Tag size={25} />
              <h2>
                {scan.source
                  ? "Looking for your first find"
                  : "Your finds appear here"}
              </h2>
              <p>
                Clear labels help identify the right model. Tap a result to
                compare prices.
              </p>
            </div>
          ) : (
            scan.found.map((row) => (
              <ScanResultCard
                key={rowKey(row)}
                row={row}
                active={focused && rowKey(row) === rowKey(focused)}
                onFocus={() => {
                  setFocusedKey(rowKey(row));
                  document
                    .querySelector(".current-find")
                    ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
                }}
                onChoose={() => choose(row)}
                onReview={review}
                onRetry={
                  row.retryable
                    ? () => scan.retryComparison(row.product.id, row.rowId)
                    : undefined
                }
              />
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
                  ?.scrollIntoView({ block: "start", behavior: "smooth" });
              }}
            >
              <img src={clip.poster} alt={clip.title} loading="lazy" />
              <span>
                <strong>{clip.title}</strong>
                <small>
                  {clip.description} · {Math.floor(clip.seconds / 60)}:
                  {String(clip.seconds % 60).padStart(2, "0")}
                </small>
              </span>
            </button>
          ))}
        </div>
      </details>
      {choice && (
        <ModelChoiceDialog
          product={choice.product}
          onChoose={(key) => {
            scan.selectModel(choice.product.id, key, choice.rowId);
            closeDetails();
          }}
          onClose={closeDetails}
        />
      )}
      {selected && (
        <ComparisonDialog
          key={selected.id}
          comparison={selected}
          onClose={closeDetails}
        />
      )}
    </main>
  );
}
