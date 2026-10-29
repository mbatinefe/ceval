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
export type SourceKind = "camera" | "video" | "sample" | null;
export type FoundProduct = {
  product: Product;
  comparison?: Comparison;
  error?: string;
  searching?: boolean;
  time: number;
};
export function useScanner(mode: Mode, market: Market) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null),
    objectUrl = useRef<string | null>(null);
  const generation = useRef(0),
    abort = useRef<AbortController | null>(null),
    inFlight = useRef(false);
  const runningRef = useRef(false),
    lastAnalyzed = useRef<GrayFrame | null>(null),
    previous = useRef<GrayFrame | null>(null);
  const tracked = useRef<Product[]>([]),
    lastTracking = useRef(0),
    lastAnalysis = useRef(0),
    lastDetection = useRef(0);
  const resultsRef = useRef<FoundProduct[]>([]),
    cache = useRef(new Map<string, Comparison>());
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
    [ready, setReady] = useState(false);
  const [pins, setPins] = useState<Product[]>([]),
    [found, setFound] = useState<FoundProduct[]>([]);
  const [aspect, setAspect] = useState(16 / 9);
  const updateResults = useCallback((rows: FoundProduct[]) => {
    resultsRef.current = rows;
    setFound(rows);
  }, []);
  const stopAnalysis = useCallback(() => {
    generation.current++;
    abort.current?.abort();
    abort.current = null;
    inFlight.current = false;
    runningRef.current = false;
    setRunning(false);
    setBusy(false);
    tracked.current = [];
    setPins([]);
    previous.current = null;
    lastAnalyzed.current = null;
    updateResults(
      resultsRef.current.map((row) => ({ ...row, searching: false })),
    );
  }, [updateResults]);
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
    setSourceName("");
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
      generation.current++;
      abort.current?.abort();
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
        }
      }
    }
    document.addEventListener("visibilitychange", hidden);
    return () => document.removeEventListener("visibilitychange", hidden);
  }, [closeSource, stopAnalysis]);
  async function camera() {
    closeSource();
    setError("");
    setMessage("Waiting for camera permission…");
    const epoch = generation.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error("Camera access needs a supported browser over HTTPS.");
      const media = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      if (epoch !== generation.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      sourceRef.current = "camera";
      setSource("camera");
      setSourceName("Live camera");
      if (video.current) {
        video.current.srcObject = media;
        await video.current.play();
      }
      media.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (stream.current === media) {
          closeSource();
          setMessage("Camera access ended. Open it again to continue.");
        }
      });
      setMessage("Camera ready. Start scanning when a product label is clear.");
    } catch (err) {
      if (epoch !== generation.current) return;
      closeSource();
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Camera permission was denied. Allow it in your browser settings, or choose a video."
          : err instanceof Error
            ? err.message
            : "Couldn’t open the camera.",
      );
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
    if (video.current) {
      video.current.src = objectUrl.current;
      video.current.load();
    }
    setMessage("Your video stays on this device. Play it or start scanning.");
  }
  function sample() {
    closeSource();
    setError("");
    updateResults([]);
    sourceRef.current = "sample";
    setSource("sample");
    setSourceName("Generated store footage");
    if (video.current) {
      video.current.src = "/demo/electronics-shelf-pan.mp4";
      video.current.load();
    }
    setMessage(
      "Generated footage. Recognition and prices use the same analysis as your own video.",
    );
  }
  function loaded() {
    const element = video.current;
    if (!element) return;
    if (
      sourceRef.current !== "camera" &&
      (!Number.isFinite(element.duration) || element.duration > 600)
    ) {
      closeSource();
      setError("Choose a playable video up to 10 minutes long.");
      return;
    }
    setAspect(element.videoWidth / element.videoHeight || 16 / 9);
    setReady(true);
  }
  const invalidatePosition = useCallback(() => {
    generation.current++;
    abort.current?.abort();
    abort.current = null;
    inFlight.current = false;
    setBusy(false);
    tracked.current = [];
    setPins([]);
    previous.current = null;
    lastAnalyzed.current = null;
    lastAnalysis.current = 0;
    updateResults(resultsRef.current.map((r) => ({ ...r, searching: false })));
  }, [updateResults]);
  async function analyze() {
    const element = video.current;
    if (
      !element ||
      inFlight.current ||
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
    inFlight.current = true;
    setBusy(true);
    setMessage("Identifying visible products…");
    const epoch = generation.current;
    const controller = new AbortController();
    abort.current = controller;
    try {
      const result = await scanRequest<{ products: Product[] }>(
        "/api/scan/recognize",
        { frame, market, requestId: crypto.randomUUID() },
        controller.signal,
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
        const cached = cache.current.get(`${product.id}:${mode}:${market}`);
        const row: FoundProduct = {
          product,
          time,
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
                    error: "A clearer model label is needed before searching.",
                  }
                : r,
            ),
          );
          continue;
        }
        const key = `${product.id}:${mode}:${market}`,
          cached = cache.current.get(key);
        if (cached && cached.expiresAt > Date.now()) continue;
        updateResults(
          resultsRef.current.map((r) =>
            r.product.id === product.id ? { ...r, searching: true } : r,
          ),
        );
        try {
          const comparison = await scanRequest<Comparison>(
            "/api/scan/compare",
            { productId: product.id, mode, market },
            controller.signal,
          );
          if (epoch !== generation.current) break;
          cache.current.set(key, comparison);
          updateResults(
            resultsRef.current.map((r) =>
              r.product.id === product.id
                ? { ...r, comparison, searching: false, error: undefined }
                : r,
            ),
          );
        } catch (err) {
          if (epoch !== generation.current) break;
          updateResults(
            resultsRef.current.map((r) =>
              r.product.id === product.id
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
      }
      if (epoch === generation.current)
        setMessage(
          "Scanning as you explore. Clear labels give better matches.",
        );
    } catch (err) {
      if (epoch === generation.current) {
        setError(
          err instanceof Error ? err.message : "Analysis could not finish.",
        );
        stopAnalysis();
      }
    } finally {
      if (epoch === generation.current) {
        inFlight.current = false;
        setBusy(false);
      }
    }
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
            stopAnalysis();
          });
      }
      animation = requestAnimationFrame(tick);
    }
    animation = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animation);
  }, [stopAnalysis]);
  async function start() {
    setError("");
    if (!capabilities?.analysisAvailable) {
      setMessage(capabilities?.reason || "Checking analysis availability…");
      return;
    }
    if (!ready || !video.current) return;
    stopAnalysis();
    lastAnalysis.current = 0;
    runningRef.current = true;
    setRunning(true);
    try {
      await video.current.play();
      setMessage("Scanning started. Keep the model label in view.");
    } catch {
      stopAnalysis();
      setError("Tap the video play button, then start scanning.");
    }
  }
  function ended() {
    stopAnalysis();
    setMessage("Video finished. Your identified products are listed below.");
  }
  return {
    video,
    source,
    sourceName,
    capabilities,
    message,
    error,
    running,
    busy,
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
    stopAnalysis,
    closeSource,
    ended,
    setError,
  };
}
