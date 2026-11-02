import { VideoTransport } from "../components/VideoTransport";
import { VisualMatchesDialog } from "../components/VisualMatchesDialog";
import { useEffect, useRef, useState } from "react";
import {
  Camera,
  CameraOff,
  ChevronDown,
  Upload,
  Play,
  Square,
  Tag,
  TrendingUp,
  Film,
  LoaderCircle,
  ArrowUpRight,
  X,
  RotateCw,
  ChevronUp,
  Layers,
} from "lucide-react";
import {
  markets,
  type Comparison,
  type Market,
  type Mode,
} from "../../shared/scan";
import { ComparisonDialog } from "../components/ComparisonDialog";
import { ModelChoiceDialog } from "../components/ModelChoiceDialog";
import { Price } from "../components/Price";
import { ScanResultCard } from "../components/ScanResultCard";
import { offerSummary } from "../scanner/presentation";
import { isAllowanceError } from "../scanner/state";
import { useScanner, type FoundProduct } from "../scanner/useScanner";
import { clips } from "../../../public/demo/manifest.json";
export function Scanner() {
  const rowKey = (row: FoundProduct) => row.rowId || row.product.id;

  const [mode, setMode] = useState<Mode>("buy"),
    [market, setMarket] = useState<Market>("US"),
    [selected, setSelected] = useState<Comparison | null>(null);
  const upload = useRef<HTMLInputElement>(null),
    scan = useScanner(mode, market);
  const [trayOpen, setTrayOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(true);
  const findsDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (trayOpen) findsDialog.current?.showModal();
    else findsDialog.current?.close();
  }, [trayOpen]);
  useEffect(() => {
    const header = document.querySelector<HTMLElement>(".app-header");
    if (header) header.inert = Boolean(scan.source);
    return () => {
      if (header) header.inert = false;
    };
  }, [scan.source]);
  useEffect(() => {
    if (!scan.source) {
      setTrayOpen(false);
      setCardOpen(true);
    }
  }, [scan.source]);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [visualKey, setVisualKey] = useState<string | null>(null);
  const visual = scan.found.find((row) => rowKey(row) === visualKey);
  const [choiceKey, setChoiceKey] = useState<string | null>(null);
  const resumeAfterDetails = useRef(false);
  const focused =
    scan.found.find((row) => rowKey(row) === focusedKey) ||
    scan.found.find((row) =>
      scan.pins.some((pin) => pin.rowId === rowKey(row)),
    ) ||
    scan.found[0];
  const focusedPrice = offerSummary(focused?.comparison);
  const choice = scan.found.find((row) => rowKey(row) === choiceKey);
  const allowanceNotice = scan.found.find((row) =>
    isAllowanceError(row.errorCode),
  )?.error;
  function pauseForDetails() {
    resumeAfterDetails.current ||= Boolean(
      scan.video.current && !scan.video.current.paused,
    );
    scan.video.current?.pause();
  }
  function closeDetails() {
    setSelected(null);
    setChoiceKey(null);
    setVisualKey(null);
    if (resumeAfterDetails.current && scan.running)
      void scan.video.current?.play().catch(() => {
        scan.setError("Tap the video to resume playback.");
      });
    resumeAfterDetails.current = false;
  }
  function review(comparison: Comparison) {
    pauseForDetails();
    setTrayOpen(false);
    setSelected(comparison);
  }
  function choose(row: FoundProduct) {
    pauseForDetails();
    setTrayOpen(false);
    setChoiceKey(rowKey(row));
  }
  function showMatches(row: FoundProduct) {
    pauseForDetails();
    setTrayOpen(false);
    setVisualKey(rowKey(row));
    if (!row.visualSearch && !row.visualSearching)
      scan.searchImage(row.product.id, row.rowId);
  }
  const needsLabel = (row: FoundProduct) =>
    !row.comparison &&
    !row.visualSearching &&
    !row.visualSearch?.candidates.length &&
    !row.product.candidates?.length &&
    (!row.product.model ||
      (row.product.confidence < 0.85 &&
        row.product.identification !== "user_selected"));
  const identifiable = scan.found.filter((row) => !needsLabel(row));
  const unclear = scan.found.filter(needsLabel);
  const previousFinds = scan.history
    .filter(
      (entry) =>
        !scan.found.some(
          (row) =>
            row.historyId === entry.id || row.product.id === entry.product.id,
        ),
    )
    .slice(0, 8);
  const recentFinds = previousFinds.length > 0 && (
    <section className="recent-finds" aria-label="Previous finds">
      <div className="recent-finds-heading">
        <h2>Previous finds</h2>
        <a href="/app/finds">
          View all <ArrowUpRight aria-hidden="true" />
        </a>
      </div>
      <div className="recent-finds-strip">
        {previousFinds.map((entry) => (
          <a key={entry.id} href="/app/finds" className="recent-find">
            {entry.thumbnailUrl ? (
              <img src={entry.thumbnailUrl} alt="" loading="lazy" />
            ) : (
              <span className="recent-placeholder">
                <Tag aria-hidden="true" />
              </span>
            )}
            <span>
              <strong>{entry.product.model || entry.product.label}</strong>
              <small>
                {entry.source === "sample" ? "Simulated sample · " : ""}
                {new Date(entry.updatedAt).toLocaleDateString()}
              </small>
            </span>
          </a>
        ))}
      </div>
    </section>
  );
  const renderFind = (row: FoundProduct) => (
    <ScanResultCard
      key={rowKey(row)}
      row={row}
      active={focused && rowKey(row) === rowKey(focused)}
      onFocus={() => {
        setFocusedKey(rowKey(row));
        setCardOpen(true);
        setTrayOpen(false);
        closeDetails();
      }}
      onVisual={() => showMatches(row)}
      onChoose={() => choose(row)}
      onReview={review}
      onRetry={
        row.retryable
          ? () => scan.retryComparison(row.product.id, row.rowId)
          : undefined
      }
    />
  );
  const resultsPanel = (
    <aside className="scan-results">
      <div className="results-heading">
        <h2>This scan</h2>
        <span>{scan.found.length}</span>
      </div>
      {scan.historyState.failed > 0 ? (
        <p className="history-sync-note" role="status">
          Some finds haven’t saved.{" "}
          <button onClick={scan.retryHistory}>Retry saving</button>
        </p>
      ) : (
        scan.found.length > 0 && (
          <p className="history-sync-note" role="status">
            {scan.historyState.pending
              ? "Saving your finds…"
              : "Photos and finds are saved automatically."}
          </p>
        )
      )}
      {scan.historyLoadError && (
        <p className="history-sync-note">
          Previous finds couldn’t load. <a href="/app/finds">Try Your finds</a>
        </p>
      )}
      {allowanceNotice && (
        <p className="results-notice" role="status">
          {allowanceNotice}
        </p>
      )}
      {scan.found.length === 0 ? (
        <div className="results-empty">
          <Tag aria-hidden="true" />
          <h2>
            {scan.source
              ? "Looking for your first find"
              : "Your finds appear here"}
          </h2>
          <p>
            Point at a product and hold steady. Ceval identifies it and searches
            prices automatically.
          </p>
        </div>
      ) : (
        <>
          {identifiable.map(renderFind)}
          {unclear.length > 0 && (
            <details className="unclear-finds">
              <summary>
                {unclear.length}{" "}
                {unclear.length === 1 ? "item needs" : "items need"} a clearer
                label
              </summary>
              {unclear.map(renderFind)}
            </details>
          )}
        </>
      )}
      {scan.source && scan.found.length > 0 && (
        <button
          className="text-link"
          onClick={() => {
            setTrayOpen(false);
            closeDetails();
            scan.rescan();
          }}
          disabled={scan.busy}
        >
          <RotateCw aria-hidden="true" />
          Check this view again
        </button>
      )}
      <a href="/app/finds" className="shelf-link">
        All finds and history
        <ArrowUpRight aria-hidden="true" />
      </a>
    </aside>
  );
  return (
    <main
      className={`live-scanner app-wrap${scan.source ? " has-feed immersive-scanner" : ""}`}
    >
      <h1 className="sr-only">Scan</h1>
      <div className="scanner-controls">
        <div className="mode-switch" role="group" aria-label="Comparison mode">
          <button aria-pressed={mode === "buy"} onClick={() => setMode("buy")}>
            <Tag aria-hidden="true" />
            Buy cheaper
          </button>
          <button
            aria-pressed={mode === "resale"}
            onClick={() => setMode("resale")}
          >
            <TrendingUp aria-hidden="true" />
            Resale value
          </button>
        </div>
        <label className="market-select">
          <span className="sr-only">Market</span>
          <span className="market-value" aria-hidden="true">
            {market}
            <small>{markets[market].currency}</small>
          </span>
          <ChevronDown aria-hidden="true" />
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
                width: scan.source
                  ? `min(100vw, calc(100dvh * ${scan.aspect}))`
                  : `min(100%, calc(var(--view-height) * ${scan.aspect}))`,
              }}
            >
              <video
                ref={scan.video}
                className="user-video"
                muted
                playsInline
                controls={false}
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
                    (item) => rowKey(item) === product.rowId,
                  );
                  const x = product.box.x + product.box.width / 2;
                  const y = product.box.y + product.box.height / 2;
                  return (
                    <button
                      key={product.rowId}
                      className={`live-pin${row && focused && rowKey(row) === rowKey(focused) ? " is-active" : ""}${x < 0.35 ? " label-left" : x > 0.65 ? " label-right" : ""}${y > 0.6 ? " label-above" : ""}`}
                      style={{
                        left: `clamp(22px, ${x * 100}%, calc(100% - 22px))`,
                        top: `${Math.max(0.12, Math.min(0.85, y)) * 100}%`,
                      }}
                      aria-label={`Inspect ${product.model || product.label}`}
                      onClick={() => {
                        if (row) {
                          setFocusedKey(rowKey(row));
                          setCardOpen(true);
                        }
                      }}
                    >
                      <i>
                        {scan.found.findIndex(
                          (item) => rowKey(item) === product.rowId,
                        ) + 1 || index + 1}
                      </i>
                    </button>
                  );
                })}
              </div>
            </div>
            {!scan.source && (
              <div className="source-empty">
                <span className="viewfinder-corner top-left" />
                <span className="viewfinder-corner top-right" />
                <span className="viewfinder-corner bottom-left" />
                <span className="viewfinder-corner bottom-right" />
                <h2>Point at a product and its price tag.</h2>
                <p>
                  {mode === "buy"
                    ? "Ceval reads the label, then checks what the same model costs online."
                    : "Ceval reads the item, then finds what similar ones are listed for secondhand."}
                </p>
                <button
                  className="button primary"
                  onClick={() => void scan.camera()}
                  disabled={scan.cameraPending}
                >
                  <Camera aria-hidden="true" /> Open camera
                </button>
                <div className="source-alt">
                  <button
                    className="text-link"
                    onClick={() => upload.current?.click()}
                  >
                    <Upload aria-hidden="true" /> Choose a video
                  </button>
                  <button className="text-link" onClick={() => scan.sample()}>
                    <Film aria-hidden="true" /> Try a sample
                  </button>
                </div>
              </div>
            )}
            {scan.source && (
              <div className="input-label">
                <span>
                  <i className={scan.source === "camera" ? "is-live" : ""} />
                  {scan.source === "camera"
                    ? "Live camera"
                    : scan.source === "sample"
                      ? "Simulated sample"
                      : "Your video"}
                </span>
                <button
                  aria-label="Close video source"
                  onClick={scan.closeSource}
                >
                  <X aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
          {!scan.source && (
            <p className="source-consent">
              Selected frames go to Meta for recognition and price search. Small
              product photos are saved privately to your finds.
            </p>
          )}
          {scan.source && scan.source !== "camera" && (
            <VideoTransport
              video={scan.video}
              sourceKey={scan.sourceName}
              onPlay={scan.start}
            />
          )}
          {scan.source === "camera" && scan.previewBlocked && (
            <div className="scan-actions preview-actions">
              <p className="scan-status" role="status">
                Camera access is allowed. Your browser needs a tap to play the
                preview.
              </p>
              <button
                className="button primary small"
                onClick={() => void scan.playCameraPreview()}
              >
                <Play aria-hidden="true" /> Play camera preview
              </button>
            </div>
          )}
          {scan.source && (
            <div className="scan-actions">
              <button
                className="scan-tray-button"
                onClick={() => {
                  pauseForDetails();
                  setTrayOpen(true);
                }}
                aria-label={`Show all ${scan.found.length} finds`}
              >
                <Layers aria-hidden="true" />
                <span>{scan.found.length} finds</span>
              </button>
              <div className="scan-status" role="status">
                {scan.busy ||
                scan.startupState === "starting" ||
                scan.startupState === "waiting" ? (
                  <LoaderCircle className="spin" aria-hidden="true" />
                ) : (
                  <span
                    className={`status-dot ${scan.running ? "active" : ""}`}
                  />
                )}
                <span>{scan.message}</span>
              </div>
              {scan.running ||
              scan.startupState === "waiting" ||
              scan.startupState === "starting" ? (
                <button
                  className="button dark small"
                  onClick={() => {
                    scan.stopScan();
                    scan.video.current?.pause();
                  }}
                >
                  <Square aria-hidden="true" />
                  {scan.running ? "Stop scan" : "Cancel start"}
                </button>
              ) : (
                <button
                  className="button primary small"
                  disabled={
                    !scan.canResume || !scan.capabilities?.analysisAvailable
                  }
                  onClick={() => void scan.start()}
                >
                  <Play aria-hidden="true" />
                  {scan.startupState === "blocked"
                    ? "Tap to start scanning"
                    : scan.found.length
                      ? "Resume scan"
                      : "Start scanning"}
                </button>
              )}
            </div>
          )}
          {scan.finishing && (
            <button
              className="text-link cancel-searches"
              onClick={scan.cancelSearches}
            >
              Cancel remaining searches
            </button>
          )}
          {scan.source && scan.found.length > 0 && (
            <button
              className="text-link rescan-view"
              onClick={scan.rescan}
              disabled={scan.busy}
            >
              <RotateCw aria-hidden="true" /> Check this view again
            </button>
          )}
          {scan.source && scan.found.length > 0 && (
            <div className="floating-finds">
              <div className="finds-rail" aria-label="Items found in this scan">
                {scan.found.map((row, index) => {
                  return (
                    <button
                      key={rowKey(row)}
                      aria-label={`Show ${row.product.model || row.product.label}`}
                      aria-pressed={focused && rowKey(row) === rowKey(focused)}
                      onClick={() => {
                        setFocusedKey(rowKey(row));
                        setCardOpen(true);
                      }}
                    >
                      {row.thumbnail ? (
                        <img src={row.thumbnail} alt="" />
                      ) : (
                        <Tag aria-hidden="true" />
                      )}
                      <span className="rail-number">{index + 1}</span>
                      {(row.searching ||
                        row.visualSearching ||
                        row.selecting) && (
                        <span className="rail-searching">
                          <LoaderCircle
                            className="spin"
                            aria-label="Searching"
                          />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {focused && (
                <section
                  className={`floating-card${cardOpen ? " is-expanded" : ""}`}
                  aria-label="Selected find"
                >
                  <button
                    className="floating-card-toggle"
                    aria-expanded={cardOpen}
                    aria-controls="floating-find-details"
                    onClick={() => setCardOpen(!cardOpen)}
                  >
                    <span>
                      {cardOpen
                        ? "Selected find"
                        : focused.product.model || focused.product.label}
                    </span>
                    {!cardOpen && focusedPrice && (
                      <span className="collapsed-price">
                        <Price
                          minor={focusedPrice.offer.priceMinor}
                          currency={focusedPrice.offer.currency}
                        />
                        <small>
                          {[focusedPrice.shortLabel, focusedPrice.qualification]
                            .filter(Boolean)
                            .join(" · ")}
                        </small>
                      </span>
                    )}
                    {cardOpen ? (
                      <ChevronDown aria-hidden="true" />
                    ) : (
                      <ChevronUp aria-hidden="true" />
                    )}
                  </button>
                  <div id="floating-find-details" hidden={!cardOpen}>
                    <ScanResultCard
                      row={focused}
                      compact
                      context={
                        scan.pins.some((pin) => pin.rowId === rowKey(focused))
                          ? "IN VIEW"
                          : "FOUND"
                      }
                      onVisual={() => showMatches(focused)}
                      onChoose={() => choose(focused)}
                      onReview={review}
                      onRetry={
                        focused.retryable
                          ? () =>
                              scan.retryComparison(
                                focused.product.id,
                                focused.rowId,
                              )
                          : undefined
                      }
                    />
                  </div>
                </section>
              )}
            </div>
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
            <summary>Video and privacy</summary>
            <p>
              Up to 150 MB · 10 minutes. Choosing a source starts scanning when
              it is ready. Your full video stays on this device; selected frames
              go to Meta for analysis and product search. Small cropped product
              photos are saved privately to your account with your latest 100
              finds. Delete them anytime in Your finds.
            </p>
          </details>
        </section>
        {!scan.source && resultsPanel}
      </div>
      {recentFinds}
      <details className="sample-library">
        <summary>
          <span>
            <Film aria-hidden="true" /> Sample videos
          </span>
          <small>{clips.length} simulated clips</small>
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
      <dialog
        ref={findsDialog}
        className="product-dialog scan-finds-dialog"
        aria-label="All finds from this scan"
        onCancel={() => {
          setTrayOpen(false);
          closeDetails();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            setTrayOpen(false);
            closeDetails();
          }
        }}
      >
        <div className="finds-dialog-header">
          <span>Your scan</span>
          <button
            className="icon-button"
            aria-label="Close all finds"
            onClick={() => {
              setTrayOpen(false);
              closeDetails();
            }}
          >
            <X aria-hidden="true" />
          </button>
        </div>
        {scan.source && resultsPanel}
      </dialog>
      {visual && (
        <VisualMatchesDialog
          product={visual.product}
          photo={visual.thumbnail}
          result={visual.visualSearch}
          searching={visual.visualSearching}
          error={visual.visualError}
          mode={mode}
          onSearch={() => scan.searchImage(visual.product.id, visual.rowId)}
          onChoose={(key) => {
            scan.selectModel(visual.product.id, key, visual.rowId);
            closeDetails();
          }}
          onClose={closeDetails}
        />
      )}
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
