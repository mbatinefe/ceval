import type { VisualSearch } from "../../shared/visual-search";
import { visualSearchNeeded, visualResultMatches } from "./visual-search";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Comparison,
  Market,
  Mode,
  Product,
  ScanCapabilities,
} from "../../shared/scan";
import { api } from "../lib/api";
import {
  captureFrame,
  grayFrame,
  scanRequest,
  ScanRequestError,
  videoFileError,
} from "./media";
import {
  DetectionTrail,
  frameDifference,
  trackDetection,
  type GrayFrame,
} from "./tracking";
import {
  cachedComparison,
  cacheMatchingComparison,
  comparisonKey,
  comparisonNeeded,
  completionMessage,
  interruptFinds,
  isAllowanceError,
  recognitionRetryAt,
  findActionRow,
  switchComparisonMode,
  ScanFindCount,
} from "./state";
import { reconcileCurrentSightings, type FoundProduct } from "./continuity";
import { ScanWork } from "./work";
import { CaptureBuffer } from "./capture-buffer";
import { trialCountdown, finishTrialInput, TRIAL_ENDED_MESSAGE } from "./trial";
import { retryCapturedRequest } from "./recognition-request";
import {
  MediaStartup,
  cameraFailure,
  mediaReadiness,
  type CameraFailure,
  type StartupState,
} from "./startup";
import { clips } from "../../../public/demo/manifest.json";
import { SceneMemory } from "./scene-memory";
import { productPhotos } from "./photos";
import { HistoryWriter } from "./history-writer";
import type { ScanHistoryEntry } from "../../shared/history";
export type SourceKind = "camera" | "video" | "sample" | null;
export type ScanPin = Product & { rowId: string };
export type { FoundProduct } from "./continuity";
export function useScanner(mode: Mode, market: Market) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null),
    objectUrl = useRef<string | null>(null);
  const generation = useRef(0);
  const comparisonContext = useRef({ mode, market });
  const [work] = useState(() => new ScanWork());
  const [captureBuffer] = useState(() => new CaptureBuffer());
  const analyzeRef = useRef<() => Promise<void>>(async () => {});
  const [findCount] = useState(() => new ScanFindCount());
  const [totalFound, setTotalFound] = useState(0);
  const [sceneMemory] = useState(() => new SceneMemory());
  const historyWriter = useRef<HistoryWriter<ScanHistoryEntry> | null>(null);
  const [history, setHistory] = useState<ScanHistoryEntry[]>([]);
  const [historyState, setHistoryState] = useState({ pending: 0, failed: 0 });
  const [historyLoadError, setHistoryLoadError] = useState(false);
  const [detectionTrail] = useState(() => new DetectionTrail());
  const [startup] = useState(() => new MediaStartup());
  const [startupState, setStartupState] = useState<StartupState>("idle");
  const [cameraPending, setCameraPending] = useState(false);
  const [previewBlocked, setPreviewBlocked] = useState(false);
  const [cameraProblem, setCameraProblem] = useState<CameraFailure | null>(
    null,
  );
  const [prepared, setPrepared] = useState(false);
  const finished = useRef<"video" | "error" | "stopped" | null>(null);
  const positionRevision = useRef(0);
  const cameraRevision = useRef(0);
  const runningRef = useRef(false),
    lastAnalyzed = useRef<GrayFrame | null>(null),
    previous = useRef<GrayFrame | null>(null);
  const tracked = useRef<ScanPin[]>([]),
    lastTracking = useRef(0),
    lastAnalysis = useRef(0);
  const resultsRef = useRef<FoundProduct[]>([]),
    cache = useRef(new Map<string, Comparison>());
  const pendingSelections = useRef(new Set<string>());
  const comparisonBlock = useRef<{ error: string; errorCode: string } | null>(
    null,
  );
  const recognitionRecovery = useRef({ attempts: 0, retryAt: 0 });
  const sourceRef = useRef<SourceKind>(null);
  const [source, setSource] = useState<SourceKind>(null),
    [sourceName, setSourceName] = useState("");
  const [capabilities, setCapabilities] = useState<ScanCapabilities | null>(
    null,
  );
  const capabilitySnapshot = useRef<{
    value: ScanCapabilities;
    receivedAt: number;
  } | null>(null);
  const [trialNow, setTrialNow] = useState(Date.now);
  const trialRemainingSeconds = trialCountdown(
    capabilities?.trialAccess,
    capabilitySnapshot.current?.receivedAt ?? trialNow,
    trialNow,
  );
  const trialExpired = trialRemainingSeconds === 0;
  const trialHasEnded = useCallback(() => {
    const snapshot = capabilitySnapshot.current;
    return (
      trialCountdown(
        snapshot?.value.trialAccess,
        snapshot?.receivedAt ?? 0,
        Date.now(),
      ) === 0
    );
  }, []);
  const [message, setMessage] = useState(
    "Choose your camera or a video to get started.",
  );
  const [error, setError] = useState(""),
    [running, setRunning] = useState(false),
    [busy, setBusy] = useState(false),
    [finishing, setFinishing] = useState(false),
    [ready, setReady] = useState(false);
  const [pins, setPins] = useState<ScanPin[]>([]),
    [found, setFound] = useState<FoundProduct[]>([]);
  const [aspect, setAspect] = useState(16 / 9);
  useEffect(() => {
    let active = true;
    const writer = new HistoryWriter<ScanHistoryEntry>(async (data, signal) => {
      const result = await scanRequest<{ entry: ScanHistoryEntry }>(
        "/api/scan/history",
        data,
        signal,
      );
      return result.entry;
    });
    historyWriter.current = writer;
    writer.onChange = () => setHistoryState(writer.state);
    writer.onSaved = (entry) =>
      setHistory((rows) =>
        [
          entry,
          ...rows.filter(
            (row) =>
              row.id !== entry.id &&
              !(
                row.product.id === entry.product.id &&
                row.source === entry.source
              ),
          ),
        ]
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, 100),
      );
    api<{ entries: ScanHistoryEntry[] }>("/api/scan/history")
      .then(({ entries }) => {
        if (active)
          setHistory((rows) =>
            [
              ...rows,
              ...entries.filter(
                (entry) => !rows.some((row) => row.id === entry.id),
              ),
            ]
              .sort((a, b) => b.updatedAt - a.updatedAt)
              .slice(0, 100),
          );
      })
      .catch(() => {
        if (active) setHistoryLoadError(true);
      });
    return () => {
      active = false;
      writer.dispose();
      if (historyWriter.current === writer) historyWriter.current = null;
    };
  }, [historyWriter]);
  useEffect(() => {
    startup.onChange = setStartupState;
    return () => {
      startup.onChange = undefined;
    };
  }, [startup]);
  useEffect(() => {
    work.onChange = () => {
      const state = work.state;
      const draining =
        state.draining || Boolean(finished.current && captureBuffer.length);
      setBusy(
        state.recognizing || state.pending > 0 || captureBuffer.length > 0,
      );
      setFinishing(draining);
      if (finished.current)
        setMessage(
          completionMessage(
            resultsRef.current,
            finished.current,
            draining,
            comparisonContext.current,
          ),
        );
    };
    work.onError = () =>
      setError("A price search could not finish. Try scanning again.");
    return () => {
      work.onChange = undefined;
      work.onError = undefined;
    };
  }, [work, captureBuffer]);
  const updateResults = useCallback(
    (rows: FoundProduct[]) => {
      resultsRef.current = rows;
      setFound(rows);
      setTotalFound(findCount.update(rows));
      if (sourceRef.current)
        for (const row of rows) {
          if (!row.historyId) continue;
          historyWriter.current?.enqueue({
            id: row.historyId,
            productId: row.product.id,
            comparisonId: row.comparison?.id,
            thumbnail: row.thumbnail,
            source: sourceRef.current,
            mode: comparisonContext.current.mode,
          });
        }
      if (finished.current)
        setMessage(
          completionMessage(
            rows,
            finished.current,
            work.state.draining || Boolean(captureBuffer.length),
            comparisonContext.current,
          ),
        );
    },
    [work, historyWriter, findCount, captureBuffer],
  );
  const stopAnalysis = useCallback(() => {
    cameraRevision.current++;
    startup.cancel();
    setCameraPending(false);
    generation.current++;
    finished.current = null;
    captureBuffer.clear();
    work.cancel();
    detectionTrail.clear();
    pendingSelections.current.clear();
    runningRef.current = false;
    setRunning(false);
    setBusy(false);
    tracked.current = [];
    setPins([]);
    previous.current = null;
    lastAnalyzed.current = null;
    updateResults(interruptFinds(resultsRef.current));
  }, [startup, updateResults, work, detectionTrail, captureBuffer]);
  const finishAnalysis = useCallback(
    (reason: "video" | "error" | "stopped") => {
      startup.cancel();
      finished.current = reason;
      runningRef.current = false;
      setRunning(false);
      if (reason !== "video") video.current?.pause();
      if (reason === "error" || trialHasEnded()) captureBuffer.clear();
      if (!captureBuffer.length) work.finishInput();
      else {
        setFinishing(true);
        setBusy(true);
        setMessage("Finishing captured views and price searches…");
        void analyzeRef.current().catch(() => {
          captureBuffer.clear();
          work.finishInput();
          setError(
            "Some captured views could not finish. Your completed finds are kept.",
          );
        });
      }
    },
    [startup, work, captureBuffer, trialHasEnded],
  );
  const endTrial = useCallback(() => {
    startup.cancel();
    finished.current = "stopped";
    runningRef.current = false;
    setRunning(false);
    finishTrialInput(captureBuffer, work);
    setError("");
    setMessage(TRIAL_ENDED_MESSAGE);
  }, [startup, captureBuffer, work]);
  useEffect(() => {
    if (trialExpired) endTrial();
  }, [trialExpired, endTrial]);
  useEffect(() => {
    if (capabilities?.trialAccess?.startedAt == null || trialExpired) return;
    const timer = setInterval(() => setTrialNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [capabilities?.trialAccess?.startedAt, trialExpired]);
  const closeSource = useCallback(() => {
    stopAnalysis();
    sceneMemory.clear();
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) {
      video.current.pause();
      video.current.srcObject = null;
      video.current.removeAttribute("src");
      video.current.load();
    }
    if (objectUrl.current) {
      URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = null;
    }
    sourceRef.current = null;
    setSource(null);
    setReady(false);
    setPrepared(false);
    setCameraPending(false);
    setCameraProblem(null);
    setPreviewBlocked(false);
    setSourceName("");
    comparisonBlock.current = null;
    setMessage("Choose your camera or a video to get started.");
  }, [stopAnalysis, sceneMemory]);
  useEffect(() => {
    let active = true;
    let poll: ReturnType<typeof setTimeout>;
    async function refreshCapabilities() {
      try {
        const value = await api<ScanCapabilities>("/api/scan/capabilities");
        if (!active) return;
        const receivedAt = Date.now();
        capabilitySnapshot.current = { value, receivedAt };
        setTrialNow(receivedAt);
        setCapabilities(value);
      } catch {
        if (active && !capabilitySnapshot.current)
          setError(
            "Couldn’t check analysis availability. Refresh to try again.",
          );
      } finally {
        if (
          active &&
          capabilitySnapshot.current?.value.trialAccess &&
          !trialHasEnded()
        )
          poll = setTimeout(() => void refreshCapabilities(), 5000);
      }
    }
    void refreshCapabilities();
    return () => {
      active = false;
      clearTimeout(poll);
      startup.cancel();
      generation.current++;
      captureBuffer.clear();
      work.cancel();
      detectionTrail.clear();
      stream.current?.getTracks().forEach((t) => t.stop());
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, []);
  useEffect(() => {
    const previousContext = comparisonContext.current;
    comparisonContext.current = { mode, market };
    if (previousContext.market !== market) {
      updateResults([]);
      stopAnalysis();
      sceneMemory.clear();
      lastAnalysis.current = 0;
    } else if (previousContext.mode !== mode) {
      const rows = switchComparisonMode(
        resultsRef.current,
        mode,
        market,
        cache.current,
      );
      updateResults(rows);
      for (const row of rows) {
        queueComparison(row);
        searchImage(row.product.id, row.rowId, false);
      }
    }
  }, [mode, market]);
  useEffect(() => {
    function hidden() {
      if (document.hidden) {
        cameraRevision.current++;
        setCameraPending(false);
        finishAnalysis("stopped");
        if (sourceRef.current === "camera") {
          const media = stream.current;
          stream.current = null;
          media?.getTracks().forEach((track) => track.stop());
          setPrepared(false);
          setReady(false);
        }
      }
    }
    document.addEventListener("visibilitychange", hidden);
    return () => document.removeEventListener("visibilitychange", hidden);
  }, [finishAnalysis]);
  async function playCameraPreview() {
    const element = video.current;
    if (!element || sourceRef.current !== "camera" || document.hidden) return;
    const result = await startup.preview(() => element.play());
    if (result === "cancelled") return;
    setPreviewBlocked(result === "blocked");
    if (result === "blocked")
      setMessage(
        "Camera preview needs a tap. Tap Play camera preview to continue.",
      );
    else if (!runningRef.current) setMessage("Camera preview is playing.");
  }
  async function camera(keepFinds = sourceRef.current === "camera") {
    if (!keepFinds) {
      closeSource();
      updateResults([]);
    }
    setError("");
    setCameraProblem(null);
    setCameraPending(true);
    setPrepared(false);
    setReady(false);
    setMessage("Waiting for camera permission…");
    const epoch = generation.current;
    const request = ++cameraRevision.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new DOMException("Camera API unavailable", "NotSupportedError");
      const media = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      if (
        epoch !== generation.current ||
        request !== cameraRevision.current ||
        document.hidden
      ) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      sourceRef.current = "camera";
      setCameraPending(false);
      setSource("camera");
      setSourceName("Live camera");
      startup.arm();
      if (video.current) video.current.srcObject = media;
      media.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (stream.current === media) {
          stream.current = null;
          finishAnalysis("stopped");
          setPrepared(false);
          setCameraProblem(
            cameraFailure(new DOMException("Camera ended", "NotReadableError")),
          );
          setMessage("Camera access ended. Retry camera to continue.");
        }
      });
      setMessage("Opening camera. Scanning starts automatically when ready…");
      void playCameraPreview();
    } catch (err) {
      if (epoch !== generation.current || request !== cameraRevision.current)
        return;
      if (!keepFinds) closeSource();
      else {
        setCameraPending(false);
        finishAnalysis("stopped");
      }
      setCameraProblem(cameraFailure(err));
      setMessage("Camera unavailable. Retry camera or choose a video.");
    }
  }
  function chooseVideo(file: File) {
    const problem = videoFileError(file);
    if (problem) {
      setError(problem);
      return;
    }
    closeSource();
    setError("");
    updateResults([]);
    cache.current.clear();
    objectUrl.current = URL.createObjectURL(file);
    sourceRef.current = "video";
    setSource("video");
    setSourceName(file.name);
    startup.arm();
    if (video.current) {
      video.current.src = objectUrl.current;
      video.current.load();
    }
    setMessage("Loading your video. Scanning starts automatically when ready…");
  }
  function sample(clip = clips[0]) {
    closeSource();
    setError("");
    updateResults([]);
    sourceRef.current = "sample";
    setSource("sample");
    setSourceName(clip.title);
    startup.arm();
    if (video.current) {
      video.current.src = clip.video;
      video.current.load();
    }
    setMessage(
      "Loading generated footage. Scanning starts automatically when ready…",
    );
  }
  function loaded() {
    const element = video.current;
    if (!element || !sourceRef.current) return;
    const readiness = mediaReadiness(element, sourceRef.current === "camera");
    if (readiness === "invalid") {
      closeSource();
      setError("Choose a playable video up to 10 minutes long.");
      return;
    }
    setAspect(element.videoWidth / element.videoHeight || 16 / 9);
    setPrepared(
      element.readyState >= 1 &&
        element.videoWidth > 0 &&
        element.videoHeight > 0 &&
        (sourceRef.current === "camera" || Number.isFinite(element.duration)),
    );
    setReady(readiness === "ready");
  }
  const invalidatePosition = useCallback(() => {
    positionRevision.current++;
    captureBuffer.clear();
    detectionTrail.clear();
    tracked.current = [];
    setPins([]);
    previous.current = null;
    lastAnalyzed.current = null;
    lastAnalysis.current = 0;
  }, [detectionTrail, captureBuffer]);

  function comparisonFailure(err: unknown) {
    const failure = {
      error: err instanceof Error ? err.message : "Price search failed.",
      errorCode: err instanceof ScanRequestError ? err.code : "search_failed",
      retryable: true,
      searching: false,
    };
    if (isAllowanceError(failure.errorCode)) comparisonBlock.current = failure;
    return failure;
  }
  function queueComparison(row: FoundProduct) {
    const { mode, market } = comparisonContext.current;
    if (!comparisonNeeded(row)) return;
    const { product } = row;
    const key = comparisonKey(product, mode, market);
    const epoch = generation.current;
    const updateMatching = (change: Partial<FoundProduct>) => {
      if (
        comparisonContext.current.mode !== mode ||
        comparisonContext.current.market !== market
      )
        return;
      updateResults(
        resultsRef.current.map((item) =>
          comparisonKey(item.product, mode, market) === key
            ? {
                ...item,
                ...change,
                ...(change.comparison && item.errorCode === "shelf_changed"
                  ? {
                      error: item.error,
                      errorCode: item.errorCode,
                      retryable: false,
                    }
                  : {}),
              }
            : item,
        ),
      );
      if (change.comparison && !change.comparison.offers.length)
        for (const item of resultsRef.current)
          if (comparisonKey(item.product, mode, market) === key)
            searchImage(item.product.id, item.rowId, false);
    };
    const cached = cachedComparison(cache.current, product, mode, market);
    if (cached) {
      updateMatching({
        comparison: cached,
        searching: false,
        error: undefined,
        errorCode: undefined,
        retryable: false,
      });
      return;
    }
    if (trialHasEnded()) return;
    if (comparisonBlock.current) {
      updateMatching({
        ...comparisonBlock.current,
        searching: false,
        retryable: true,
      });
      return;
    }
    updateMatching({
      searching: true,
      retryable: false,
      error: undefined,
      errorCode: undefined,
    });
    const queued = work.compare(
      key,
      async (signal) => {
        if (
          epoch !== generation.current ||
          signal.aborted ||
          comparisonContext.current.mode !== mode ||
          comparisonContext.current.market !== market ||
          !resultsRef.current.some(
            (item) => comparisonKey(item.product, mode, market) === key,
          )
        )
          return;
        if (comparisonBlock.current) {
          updateMatching({
            ...comparisonBlock.current,
            searching: false,
            retryable: true,
          });
          return;
        }
        try {
          const comparison = await scanRequest<Comparison>(
            "/api/scan/compare",
            { productId: product.id, mode, market },
            signal,
          );
          if (epoch !== generation.current) return;
          if (
            !cacheMatchingComparison(
              cache.current,
              product,
              mode,
              market,
              comparison,
            )
          )
            throw new Error(
              "The shelf label changed during search. Scan this item again.",
            );
          updateMatching({
            comparison,
            searching: false,
            error: undefined,
            errorCode: undefined,
            retryable: false,
          });
        } catch (err) {
          if (epoch !== generation.current) return;
          updateMatching(comparisonFailure(err));
        }
      },
      "price",
      () =>
        epoch === generation.current &&
        comparisonContext.current.mode === mode &&
        comparisonContext.current.market === market &&
        resultsRef.current.some(
          (item) => comparisonKey(item.product, mode, market) === key,
        ),
    );
    if (!queued)
      updateMatching({
        searching: false,
        error: "The search queue is full. Retry this comparison shortly.",
        errorCode: "queue_full",
        retryable: true,
      });
  }
  function searchImage(productId: string, rowId?: string, manual = true) {
    if (trialHasEnded()) return;
    const { mode, market } = comparisonContext.current;
    const row = findActionRow(resultsRef.current, productId, rowId);
    if (!row || row.visualSearching || row.selecting || !row.thumbnail) return;
    if (
      !manual &&
      !visualSearchNeeded(
        row,
        market,
        Boolean(capabilities?.visualSearchAvailable),
        mode,
      )
    )
      return;
    const epoch = generation.current;
    const update = (patch: Partial<FoundProduct>) => {
      if (epoch !== generation.current) return;
      updateResults(
        resultsRef.current.map((item) =>
          item.rowId === row.rowId && item.product.id === productId
            ? { ...item, ...patch }
            : item,
        ),
      );
    };
    if (!capabilities?.visualSearchAvailable) {
      update({
        visualError:
          "Image search is not connected yet. You can still scan labels and search known models.",
      });
      return;
    }
    update({ visualSearching: true, visualError: undefined });
    const queued = work.compare(
      `visual:${productId}:${market}:${mode}`,
      async (signal) => {
        if (
          epoch !== generation.current ||
          signal.aborted ||
          !findActionRow(resultsRef.current, productId, row.rowId)
        )
          return;
        if (
          comparisonContext.current.mode !== mode ||
          comparisonContext.current.market !== market
        ) {
          update({ visualSearching: false, visualError: undefined });
          searchImage(productId, row.rowId, false);
          return;
        }
        try {
          if (!row.historyId || !sourceRef.current)
            throw new Error("Save this find before searching its photo.");
          await scanRequest(
            "/api/scan/history",
            {
              id: row.historyId,
              productId,
              source: sourceRef.current,
              mode: comparisonContext.current.mode,
              thumbnail: row.thumbnail,
            },
            signal,
          );
          if (epoch !== generation.current || signal.aborted) return;
          const result = await scanRequest<VisualSearch>(
            "/api/scan/visual-matches",
            { productId, market, mode, image: row.thumbnail },
            signal,
          );
          if (!visualResultMatches(row, result, market, mode))
            throw new Error(
              "This result belongs to a different item. Scan again.",
            );
          update({
            visualSearch: result,
            visualSearching: false,
            visualError: undefined,
          });
        } catch (error) {
          update({
            visualSearching: false,
            visualError:
              error instanceof Error
                ? error.message
                : "Image search could not finish. Try again.",
          });
        }
        if (
          epoch === generation.current &&
          comparisonContext.current.mode !== mode
        ) {
          update({ visualError: undefined });
          searchImage(productId, row.rowId, false);
        }
      },
      "photo",
      () =>
        epoch === generation.current &&
        Boolean(findActionRow(resultsRef.current, productId, row.rowId)),
    );
    if (!queued)
      update({
        visualSearching: false,
        visualError: "Image search queue is full. Try again shortly.",
      });
  }
  function retryComparison(productId: string, rowId?: string) {
    if (trialHasEnded()) return;
    const row = findActionRow(resultsRef.current, productId, rowId);
    if (!row || row.searching || row.selecting) return;
    comparisonBlock.current = null;
    const retry = {
      ...row,
      error: undefined,
      errorCode: undefined,
      retryable: false,
    };
    updateResults(
      resultsRef.current.map((item) => (item === row ? retry : item)),
    );
    queueComparison(retry);
  }
  async function analyze() {
    if (trialHasEnded()) {
      endTrial();
      return;
    }
    const element = video.current;
    if (!element) return;
    const now = Date.now();
    // Capture continues while the provider works, with bounded JPEG memory.
    if (
      runningRef.current &&
      element.readyState >= 2 &&
      !element.seeking &&
      !element.paused &&
      now - lastAnalysis.current >= 2500
    ) {
      const thumbnail = grayFrame(element);
      const remembered = sceneMemory.match(
        thumbnail,
        new Set(resultsRef.current.map((row) => row.rowId || row.product.id)),
      );
      if (remembered) {
        lastAnalysis.current = now;
        if (!work.state.recognizing)
          setMessage("Already found these items. Point at something new.");
        for (const id of remembered) {
          const row = resultsRef.current.find(
            (item) => (item.rowId || item.product.id) === id,
          );
          if (row) queueComparison(row);
        }
      } else if (
        !lastAnalyzed.current ||
        frameDifference(lastAnalyzed.current, thumbnail) >= 7 ||
        now - lastAnalysis.current >= 30000
      ) {
        captureBuffer.push({
          image: captureFrame(element),
          gray: thumbnail,
          time: sourceRef.current === "camera" ? 0 : element.currentTime,
          capturedAt: now,
          position: positionRevision.current,
        });
        lastAnalysis.current = now;
        lastAnalyzed.current = thumbnail;
      }
    }
    if (work.state.recognizing || !captureBuffer.length) return;
    const frames = captureBuffer.take();
    const latest = frames[frames.length - 1];
    setMessage(
      finished.current
        ? "Finishing captured views and price searches…"
        : "Identifying visible products…",
    );
    const epoch = generation.current;
    detectionTrail.begin(latest.gray);
    if (latest.position === positionRevision.current && element.readyState >= 2)
      detectionTrail.append(grayFrame(element));
    await work.recognize(async (signal) => {
      if (finished.current && !captureBuffer.length) work.finishInput();
      try {
        const body = {
          frames: frames.map((frame) => frame.image),
          market,
          previousProductIds: [
            ...new Set(
              resultsRef.current
                .filter(
                  (row) =>
                    row.thumbnail &&
                    row.sighting &&
                    now >= row.sighting.at &&
                    now - row.sighting.at <= 30000,
                )
                .sort((a, b) => b.sighting!.at - a.sighting!.at)
                .slice(0, 3)
                .map((row) => row.product.id),
            ),
          ],
        };
        const result = await retryCapturedRequest(
          (requestId) =>
            scanRequest<{ products: (Product & { frameIndex: number })[] }>(
              "/api/scan/recognize",
              { ...body, requestId },
              signal,
            ),
          signal,
          (error) => {
            if (trialHasEnded()) return null;
            const at = recognitionRetryAt(
              error,
              recognitionRecovery.current.attempts,
              Date.now(),
            );
            if (at === null || epoch !== generation.current) return null;
            recognitionRecovery.current = {
              attempts: recognitionRecovery.current.attempts + 1,
              retryAt: at,
            };
            setMessage(
              "Analysis interrupted. Retrying the captured views once…",
            );
            return { at };
          },
        );
        if (epoch !== generation.current) return;
        setError("");
        recognitionRecovery.current.retryAt = 0;
        for (let frameIndex = 0; frameIndex < frames.length; frameIndex++) {
          const captured = frames[frameIndex];
          const products = result.products
            .filter((product) => product.frameIndex === frameIndex)
            .map(({ frameIndex: _frameIndex, ...product }) => product);
          const photos = await productPhotos(captured.image, products);
          if (epoch !== generation.current || signal.aborted) return;
          const reconciled = await reconcileCurrentSightings(
            () => resultsRef.current,
            products,
            {
              time: captured.time,
              now: captured.capturedAt,
              frame: captured.gray,
              mode: comparisonContext.current.mode,
              market,
              cache: cache.current,
              photos,
            },
            signal,
            () => epoch === generation.current,
            (value) => updateResults(value.rows),
          );
          if (!reconciled || epoch !== generation.current || signal.aborted)
            return;
          sceneMemory.remember(
            captured.gray,
            reconciled.sightings.map((row) => row.rowId || row.product.id),
          );
          if (frameIndex === frames.length - 1) {
            const samePosition = captured.position === positionRevision.current;
            if (samePosition && element.readyState >= 2)
              detectionTrail.append(grayFrame(element));
            const projected = samePosition
              ? await detectionTrail.projectMany(
                  reconciled.sightings.map(({ product }) => product.box),
                  signal,
                )
              : null;
            if (epoch !== generation.current || signal.aborted) return;
            tracked.current = reconciled.sightings.flatMap((row, index) => {
              const box =
                captured.position === positionRevision.current
                  ? projected?.boxes[index]
                  : null;
              const currentRow = resultsRef.current.find(
                (item) => item.rowId === row.rowId,
              );
              return box && currentRow
                ? [
                    {
                      ...currentRow.product,
                      rowId: currentRow.rowId || currentRow.product.id,
                      box,
                    },
                  ]
                : [];
            });
            previous.current = projected?.frame || null;
            setPins(tracked.current);
          }
          for (const row of reconciled.sightings) {
            if (epoch !== generation.current) break;
            const currentRow = resultsRef.current.find(
              (item) => item.rowId === row.rowId,
            );
            if (currentRow) {
              queueComparison(currentRow);
              searchImage(currentRow.product.id, currentRow.rowId, false);
            }
          }
        }
        if (epoch === generation.current && !finished.current)
          setMessage(
            "Scanning as you explore. Clear labels give better matches.",
          );
      } catch (err) {
        if (epoch === generation.current && trialHasEnded()) {
          endTrial();
        } else if (epoch === generation.current) {
          setError(
            err instanceof Error ? err.message : "Analysis could not finish.",
          );
          finishAnalysis("error");
        }
      } finally {
        if (epoch === generation.current) detectionTrail.clear();
      }
    });
    // Continue after ScanWork releases its recognition slot, even with paused media.
    if (epoch === generation.current && captureBuffer.length)
      void analyzeRef.current().catch((error) => {
        if (epoch !== generation.current) return;
        setError(
          error instanceof Error
            ? error.message
            : "Couldn’t read the captured views.",
        );
        finishAnalysis("error");
      });
  }
  analyzeRef.current = analyze;
  useEffect(() => {
    let animation = 0;
    function tick() {
      const element = video.current,
        now = performance.now();
      if (
        element &&
        element.readyState >= 2 &&
        !element.paused &&
        !element.seeking &&
        now - lastTracking.current > 160
      ) {
        lastTracking.current = now;
        if (tracked.current.length || work.state.recognizing) {
          const current = grayFrame(element);
          if (work.state.recognizing) detectionTrail.append(current);
          if (tracked.current.length && previous.current) {
            tracked.current = tracked.current.flatMap((p) => {
              const box = trackDetection(previous.current!, current, p.box);
              return box ? [{ ...p, box }] : [];
            });
            setPins(tracked.current);
          }
          previous.current = current;
        }
        if (runningRef.current)
          void analyzeRef.current().catch((err) => {
            setError(
              err instanceof Error ? err.message : "Couldn’t read this frame.",
            );
            finishAnalysis("error");
          });
      }
      animation = requestAnimationFrame(tick);
    }
    animation = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animation);
  }, [finishAnalysis, detectionTrail, work]);
  async function attemptStart() {
    const element = video.current;
    if (!element || !sourceRef.current || document.hidden) return;
    if (trialHasEnded()) {
      endTrial();
      if (element.paused) void element.play().catch(() => {});
      return;
    }
    if (!capabilities?.analysisAvailable) {
      setMessage(capabilities?.reason || "Checking analysis availability…");
      return;
    }
    const result = await startup.attempt(prepared, true, () => element.play());
    if (result === "blocked") {
      setMessage("Playback needs a tap. Tap Start scanning to continue.");
      setError(
        "Your browser couldn’t start playback automatically. Tap Start scanning; if playback still fails, choose another video.",
      );
      return;
    }
    if (result !== "started" || document.hidden) return;
    if (trialHasEnded()) {
      endTrial();
      return;
    }
    loaded();
    if (!sourceRef.current) return;
    setPreviewBlocked(false);
    setError("");
    lastAnalysis.current = 0;
    recognitionRecovery.current = { attempts: 0, retryAt: 0 };
    finished.current = null;
    work.resume();
    runningRef.current = true;
    setRunning(true);
    setMessage("Scanning started. Keep the product label or tag in view.");
  }
  const attemptStartRef = useRef(attemptStart);
  attemptStartRef.current = attemptStart;
  useEffect(() => {
    if (startupState === "waiting" && prepared) void attemptStartRef.current();
  }, [startupState, prepared, capabilities]);
  function start() {
    if (trialHasEnded()) {
      endTrial();
      const element = video.current;
      if (element?.paused) void element.play().catch(() => {});
      return;
    }
    if (sourceRef.current === "camera" && !stream.current) {
      if (!cameraPending) void camera(true);
      return;
    }
    if (
      !prepared ||
      !capabilities?.analysisAvailable ||
      runningRef.current ||
      startup.state === "starting"
    )
      return;
    startup.arm();
    void attemptStart();
  }
  function ended() {
    finishAnalysis("video");
  }
  function selectModel(
    productId: string,
    candidateKey: string,
    rowId?: string,
  ) {
    if (trialHasEnded()) return;
    const row = findActionRow(resultsRef.current, productId, rowId);
    if (!row || pendingSelections.current.has(productId)) return;
    pendingSelections.current.add(productId);
    const epoch = generation.current;
    updateResults(
      resultsRef.current.map((item) =>
        item.rowId === row.rowId && item.product.id === productId
          ? { ...item, selecting: true, error: undefined }
          : item,
      ),
    );
    let selectedId = productId;
    const queued = work.select(productId, async (signal) => {
      try {
        const { product } = await scanRequest<{ product: Product }>(
          "/api/scan/select-model",
          { productId, candidateKey, market },
          signal,
        );
        if (epoch !== generation.current) return;
        selectedId = product.id;
        tracked.current = tracked.current.map((item) =>
          item.rowId === (row.rowId || productId) && item.id === productId
            ? { ...product, rowId: item.rowId, box: item.box }
            : item,
        );
        setPins(tracked.current);
        updateResults(
          resultsRef.current.map((item) =>
            item.rowId === row.rowId && item.product.id === productId
              ? {
                  ...item,
                  product,
                  visualSearch: undefined,
                  visualSearching: false,
                  visualError: undefined,
                  comparison: undefined,
                  selecting: false,
                  searching: false,
                  error: undefined,
                  errorCode: undefined,
                  retryable: false,
                }
              : item,
          ),
        );
        const selected = resultsRef.current.find(
          (item) => item.rowId === row.rowId && item.product.id === product.id,
        );
        if (selected) queueComparison(selected);
      } catch (err) {
        if (epoch !== generation.current) return;
        updateResults(
          resultsRef.current.map((item) =>
            item.rowId === row.rowId && item.product.id === selectedId
              ? {
                  ...item,
                  selecting: false,
                  searching: false,
                  error:
                    err instanceof Error
                      ? err.message
                      : "Couldn’t compare this model.",
                  errorCode:
                    err instanceof ScanRequestError
                      ? err.code
                      : "selection_failed",
                  retryable: false,
                }
              : item,
          ),
        );
      } finally {
        if (epoch === generation.current) {
          pendingSelections.current.delete(productId);
          updateResults(
            resultsRef.current.map((item) =>
              item.rowId === row.rowId && item.product.id === productId
                ? { ...item, selecting: false }
                : item,
            ),
          );
        }
      }
    });
    if (!queued) {
      pendingSelections.current.delete(productId);
      updateResults(
        resultsRef.current.map((item) =>
          item.rowId === row.rowId && item.product.id === productId
            ? {
                ...item,
                selecting: false,
                error: "Search queue is full. Try choosing again shortly.",
              }
            : item,
        ),
      );
    }
  }
  return {
    video,
    source,
    sourceName,
    capabilities:
      trialExpired && capabilities
        ? {
            ...capabilities,
            analysisAvailable: false,
            visualSearchAvailable: false,
            reason: TRIAL_ENDED_MESSAGE,
          }
        : capabilities,
    trialRemainingSeconds,
    trialStarted: capabilities?.trialAccess?.startedAt != null,
    trialExpired,
    message: trialExpired ? TRIAL_ENDED_MESSAGE : message,
    error: trialExpired ? "" : error,
    cameraPending,
    previewBlocked,
    playCameraPreview,
    cameraProblem,
    startupState,
    prepared,
    canResume:
      !trialExpired && (prepared || (source === "camera" && !cameraPending)),
    running,
    busy,
    finishing,
    ready,
    pins,
    found,
    totalFound,
    history,
    historyState,
    historyLoadError,
    retryHistory: () => historyWriter.current?.retry(),
    rescan: () => {
      if (trialHasEnded()) return;
      sceneMemory.clear();
      lastAnalysis.current = 0;
      lastAnalyzed.current = null;
      setMessage("Checking this view again…");
      if (!runningRef.current) start();
    },
    aspect,
    camera,
    chooseVideo,
    sample,
    loaded,
    invalidatePosition,
    start,
    selectModel,
    retryComparison,
    searchImage,
    stopScan: () => finishAnalysis("stopped"),
    cancelSearches: () => {
      stopAnalysis();
      setMessage(
        "Remaining searches cancelled. Your completed finds are kept.",
      );
    },
    closeSource,
    ended,
    setError,
  };
}
