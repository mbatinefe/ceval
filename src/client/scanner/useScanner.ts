import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Comparison,
  Market,
  Mode,
  Product,
  ScanCapabilities,
} from "../../shared/scan";
import { api } from "../lib/api";
import { captureFrame, grayFrame, scanRequest, videoFileError } from "./media";
import { frameDifference, trackBox, type GrayFrame } from "./tracking";
import {
  cachedComparison,
  cacheMatchingComparison,
  comparisonKey,
} from "./state";
import { ScanWork } from "./work";
import {
  MediaStartup,
  cameraFailure,
  mediaReadiness,
  type CameraFailure,
  type StartupState,
} from "./startup";
import { clips } from "../../../public/demo/manifest.json";
export type SourceKind = "camera" | "video" | "sample" | null;
export type FoundProduct = {
  product: Product;
  comparison?: Comparison;
  error?: string;
  searching?: boolean;
  time: number;
  selecting?: boolean;
};
export function useScanner(mode: Mode, market: Market) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null),
    objectUrl = useRef<string | null>(null);
  const generation = useRef(0);
  const [work] = useState(() => new ScanWork());
  const [startup] = useState(() => new MediaStartup());
  const [startupState, setStartupState] = useState<StartupState>("idle");
  const [cameraPending, setCameraPending] = useState(false);
  const [previewBlocked, setPreviewBlocked] = useState(false);
  const [cameraProblem, setCameraProblem] = useState<CameraFailure | null>(
    null,
  );
  const [prepared, setPrepared] = useState(false);
  const finished = useRef<"video" | "error" | null>(null);
  const runningRef = useRef(false),
    lastAnalyzed = useRef<GrayFrame | null>(null),
    previous = useRef<GrayFrame | null>(null);
  const tracked = useRef<Product[]>([]),
    lastTracking = useRef(0),
    lastAnalysis = useRef(0),
    lastDetection = useRef(0);
  const resultsRef = useRef<FoundProduct[]>([]),
    cache = useRef(new Map<string, Comparison>());
  const pendingSelections = useRef(new Set<string>());
  const sourceRef = useRef<SourceKind>(null);
  const [source, setSource] = useState<SourceKind>(null),
    [sourceName, setSourceName] = useState("");
  const [capabilities, setCapabilities] = useState<ScanCapabilities | null>(
    null,
  );
  const [message, setMessage] = useState(
    "Choose your camera or a video to get started.",
  );
  const [error, setError] = useState(""),
    [running, setRunning] = useState(false),
    [busy, setBusy] = useState(false),
    [finishing, setFinishing] = useState(false),
    [ready, setReady] = useState(false);
  const [pins, setPins] = useState<Product[]>([]),
    [found, setFound] = useState<FoundProduct[]>([]);
  const [aspect, setAspect] = useState(16 / 9);
  useEffect(() => {
    startup.onChange = setStartupState;
    return () => {
      startup.onChange = undefined;
    };
  }, [startup]);
  useEffect(() => {
    work.onChange = () => {
      const state = work.state;
      setBusy(state.recognizing || state.pending > 0);
      setFinishing(state.draining);
      if (finished.current)
        setMessage(
          state.draining
            ? "Finishing your remaining comparisons…"
            : finished.current === "video"
              ? "Video complete. Your finds are ready."
              : "Scanning paused. Your completed finds are kept.",
        );
    };
    work.onError = () =>
      setError("A price search could not finish. Try scanning again.");
    return () => {
      work.onChange = undefined;
      work.onError = undefined;
    };
  }, [work]);
  const updateResults = useCallback((rows: FoundProduct[]) => {
    resultsRef.current = rows;
    setFound(rows);
  }, []);
  const stopAnalysis = useCallback(() => {
    startup.cancel();
    setCameraPending(false);
    generation.current++;
    finished.current = null;
    work.cancel();
    pendingSelections.current.clear();
    runningRef.current = false;
    setRunning(false);
    setBusy(false);
    tracked.current = [];
    setPins([]);
    previous.current = null;
    lastAnalyzed.current = null;
    updateResults(
      resultsRef.current.map((row) => ({
        ...row,
        searching: false,
        selecting: false,
      })),
    );
  }, [startup, updateResults, work]);
  const finishAnalysis = useCallback(
    (reason: "video" | "error") => {
      startup.cancel();
      finished.current = reason;
      runningRef.current = false;
      setRunning(false);
      work.finishInput();
    },
    [startup, work],
  );
  const closeSource = useCallback(() => {
    stopAnalysis();
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
    setMessage("Choose your camera or a video to get started.");
  }, [stopAnalysis]);
  useEffect(() => {
    let active = true;
    api<ScanCapabilities>("/api/scan/capabilities")
      .then((value) => {
        if (active) setCapabilities(value);
      })
      .catch(() => {
        if (active)
          setError(
            "Couldn’t check analysis availability. Refresh to try again.",
          );
      });
    return () => {
      active = false;
      startup.cancel();
      generation.current++;
      work.cancel();
      stream.current?.getTracks().forEach((t) => t.stop());
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, []);
  useEffect(() => {
    stopAnalysis();
    updateResults([]);
    lastAnalysis.current = 0;
  }, [mode, market, stopAnalysis, updateResults]);
  useEffect(() => {
    function hidden() {
      if (document.hidden) {
        stopAnalysis();
        video.current?.pause();
        if (sourceRef.current === "camera") {
          closeSource();
          setMessage("Camera stopped while Ceval was in the background.");
        } else {
          setCameraPending(false);
          setMessage(
            "Scanning stopped while Ceval was in the background. Tap Start scanning to continue.",
          );
        }
      }
    }
    document.addEventListener("visibilitychange", hidden);
    return () => document.removeEventListener("visibilitychange", hidden);
  }, [closeSource, stopAnalysis]);
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
  async function camera() {
    closeSource();
    setError("");
    updateResults([]);
    setCameraPending(true);
    setMessage("Waiting for camera permission…");
    const epoch = generation.current;
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
      if (epoch !== generation.current || document.hidden) {
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
          closeSource();
          setCameraProblem(
            cameraFailure(new DOMException("Camera ended", "NotReadableError")),
          );
          setMessage("Camera access ended. Retry camera to continue.");
        }
      });
      setMessage("Opening camera. Scanning starts automatically when ready…");
      void playCameraPreview();
    } catch (err) {
      if (epoch !== generation.current) return;
      closeSource();
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
    generation.current++;
    finished.current = null;
    if (runningRef.current) work.start();
    else work.cancel();
    pendingSelections.current.clear();
    setBusy(false);
    tracked.current = [];
    setPins([]);
    previous.current = null;
    lastAnalyzed.current = null;
    lastAnalysis.current = 0;
    updateResults(
      resultsRef.current.map((r) => ({
        ...r,
        searching: false,
        selecting: false,
      })),
    );
  }, [updateResults, work]);
  async function analyze() {
    const element = video.current;
    if (
      !element ||
      work.state.recognizing ||
      !runningRef.current ||
      element.readyState < 2 ||
      element.seeking ||
      element.paused
    )
      return;
    const now = Date.now();
    if (now - lastAnalysis.current < 6000) return;
    const thumbnail = grayFrame(element);
    if (
      lastAnalyzed.current &&
      frameDifference(lastAnalyzed.current, thumbnail) < 7 &&
      now - lastAnalysis.current < 30000
    )
      return;
    const frame = captureFrame(element);
    const time = sourceRef.current === "camera" ? 0 : element.currentTime;
    lastAnalysis.current = now;
    lastAnalyzed.current = thumbnail;

    setMessage("Identifying visible products…");
    const epoch = generation.current;
    await work.recognize(async (signal) => {
      try {
        const result = await scanRequest<{ products: Product[] }>(
          "/api/scan/recognize",
          { frame, market, requestId: crypto.randomUUID() },
          signal,
        );
        if (epoch !== generation.current) return;
        const current = grayFrame(element);
        const near = frameDifference(thumbnail, current) < 5;
        tracked.current = result.products.flatMap((product) => {
          const box = near
            ? product.box
            : trackBox(thumbnail, current, product.box);
          return box ? [{ ...product, box }] : [];
        });
        previous.current = current;
        lastDetection.current = Date.now();
        setPins(tracked.current);
        let rows = [...resultsRef.current];
        for (const product of result.products) {
          const index = rows.findIndex((row) => row.product.id === product.id);
          const cached = cachedComparison(cache.current, product, mode, market);
          const row: FoundProduct = {
            product,
            time,
            selecting: pendingSelections.current.has(product.id),
            comparison:
              cached && cached.expiresAt > Date.now() ? cached : undefined,
          };
          if (index >= 0) rows[index] = row;
          else rows.unshift(row);
        }
        updateResults(rows.slice(0, 30));
        setMessage(
          result.products.length
            ? "Products identified. Checking matching prices…"
            : "No clear product label found. Move closer or try another moment.",
        );
        for (const product of result.products) {
          if (epoch !== generation.current) break;
          if (!product.model || product.confidence < 0.85) {
            updateResults(
              resultsRef.current.map((r) =>
                r.product.id === product.id
                  ? {
                      ...r,
                      error: product.candidates?.length
                        ? undefined
                        : "A clearer model label is needed before searching.",
                    }
                  : r,
              ),
            );
            continue;
          }
          const key = comparisonKey(product, mode, market),
            cached = cachedComparison(cache.current, product, mode, market);
          if (cached && cached.expiresAt > Date.now()) continue;
          updateResults(
            resultsRef.current.map((r) =>
              r.product.id === product.id ? { ...r, searching: true } : r,
            ),
          );
          const queued = work.compare(key, async (searchSignal) => {
            if (
              !resultsRef.current.some(
                (row) => comparisonKey(row.product, mode, market) === key,
              )
            )
              return;
            try {
              const comparison = await scanRequest<Comparison>(
                "/api/scan/compare",
                { productId: product.id, mode, market },
                searchSignal,
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
              ) {
                throw new Error(
                  "The shelf label changed during search. Scan this item again.",
                );
              }
              updateResults(
                resultsRef.current.map((r) =>
                  comparisonKey(r.product, mode, market) === key
                    ? { ...r, comparison, searching: false, error: undefined }
                    : r,
                ),
              );
            } catch (err) {
              if (epoch !== generation.current) return;
              updateResults(
                resultsRef.current.map((r) =>
                  comparisonKey(r.product, mode, market) === key
                    ? {
                        ...r,
                        searching: false,
                        error:
                          err instanceof Error
                            ? err.message
                            : "Price search failed.",
                      }
                    : r,
                ),
              );
            }
          });
          if (!queued)
            updateResults(
              resultsRef.current.map((r) =>
                r.product.id === product.id
                  ? {
                      ...r,
                      searching: false,
                      error:
                        "Search queue is full. Scan this item again shortly.",
                    }
                  : r,
              ),
            );
        }
        if (epoch === generation.current && !finished.current)
          setMessage(
            "Scanning as you explore. Clear labels give better matches.",
          );
      } catch (err) {
        if (epoch === generation.current) {
          setError(
            err instanceof Error ? err.message : "Analysis could not finish.",
          );
          finishAnalysis("error");
        }
      }
    });
  }
  const analyzeRef = useRef(analyze);
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
        if (tracked.current.length) {
          const current = grayFrame(element);
          if (Date.now() - lastDetection.current > 8000) {
            tracked.current = [];
            setPins([]);
          } else if (previous.current) {
            tracked.current = tracked.current.flatMap((p) => {
              const box = trackBox(previous.current!, current, p.box);
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
  }, [finishAnalysis]);
  async function attemptStart() {
    const element = video.current;
    if (!element || !sourceRef.current || document.hidden) return;
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
    loaded();
    if (!sourceRef.current) return;
    setPreviewBlocked(false);
    setError("");
    lastAnalysis.current = 0;
    work.start();
    runningRef.current = true;
    setRunning(true);
    setMessage("Scanning started. Keep the model label in view.");
  }
  const attemptStartRef = useRef(attemptStart);
  attemptStartRef.current = attemptStart;
  useEffect(() => {
    if (startupState === "waiting" && prepared) void attemptStartRef.current();
  }, [startupState, prepared, capabilities]);
  function start() {
    if (!prepared || !capabilities?.analysisAvailable) return;
    stopAnalysis();
    startup.arm();
    void attemptStart();
  }
  function ended() {
    finishAnalysis("video");
  }
  function selectModel(productId: string, candidateKey: string) {
    const row = resultsRef.current.find(
      (item) => item.product.id === productId,
    );
    if (!row || pendingSelections.current.has(productId)) return;
    pendingSelections.current.add(productId);
    const epoch = generation.current;
    updateResults(
      resultsRef.current.map((item) =>
        item.product.id === productId
          ? { ...item, selecting: true, error: undefined }
          : item,
      ),
    );
    let selectedId = productId;
    const queued = work.compare(`selection:${productId}`, async (signal) => {
      try {
        const { product } = await scanRequest<{ product: Product }>(
          "/api/scan/select-model",
          { productId, candidateKey, market },
          signal,
        );
        if (epoch !== generation.current) return;
        selectedId = product.id;
        tracked.current = tracked.current.map((item) =>
          item.id === productId ? { ...product, box: item.box } : item,
        );
        setPins(tracked.current);
        updateResults(
          resultsRef.current
            .filter((item) => item.product.id !== product.id)
            .map((item) =>
              item.product.id === productId
                ? {
                    ...item,
                    product,
                    comparison: undefined,
                    selecting: false,
                    searching: true,
                    error: undefined,
                  }
                : item,
            ),
        );
        const cached = cachedComparison(cache.current, product, mode, market);
        const comparison =
          cached ||
          (await scanRequest<Comparison>(
            "/api/scan/compare",
            { productId: product.id, mode, market },
            signal,
          ));
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
          throw new Error("The product changed. Choose its model again.");
        updateResults(
          resultsRef.current.map((item) =>
            item.product.id === product.id
              ? {
                  ...item,
                  comparison,
                  selecting: false,
                  searching: false,
                  error: undefined,
                }
              : item,
          ),
        );
      } catch (err) {
        if (epoch !== generation.current) return;
        updateResults(
          resultsRef.current.map((item) =>
            item.product.id === selectedId
              ? {
                  ...item,
                  selecting: false,
                  searching: false,
                  error:
                    err instanceof Error
                      ? err.message
                      : "Couldn’t compare this model.",
                }
              : item,
          ),
        );
      } finally {
        if (epoch === generation.current) {
          pendingSelections.current.delete(productId);
          updateResults(
            resultsRef.current.map((item) =>
              item.product.id === productId
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
          item.product.id === productId
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
    capabilities,
    message,
    error,
    cameraPending,
    previewBlocked,
    playCameraPreview,
    cameraProblem,
    startupState,
    prepared,
    running,
    busy,
    finishing,
    ready,
    pins,
    found,
    aspect,
    camera,
    chooseVideo,
    sample,
    loaded,
    invalidatePosition,
    start,
    selectModel,
    stopAnalysis: () => {
      stopAnalysis();
      setMessage("Scanning stopped. Your completed finds are kept.");
    },
    closeSource,
    ended,
    setError,
  };
}
