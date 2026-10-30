export type StartupState = "idle" | "waiting" | "starting" | "blocked";

export class MediaStartup {
  private revision = 0;
  state: StartupState = "idle";
  onChange?: (state: StartupState) => void;
  private transition(state: StartupState) {
    this.state = state;
    this.onChange?.(state);
  }
  arm() {
    this.revision++;
    this.transition("waiting");
  }
  cancel() {
    this.revision++;
    this.transition("idle");
  }
  async preview(
    play: () => Promise<void>,
  ): Promise<"playing" | "blocked" | "cancelled"> {
    const revision = this.revision;
    try {
      await play();
      return revision === this.revision ? "playing" : "cancelled";
    } catch {
      return revision === this.revision ? "blocked" : "cancelled";
    }
  }
  async attempt(
    prepared: boolean,
    available: boolean,
    play: () => Promise<void>,
  ): Promise<"idle" | "started" | "blocked" | "cancelled"> {
    if (this.state !== "waiting" || !prepared || !available) return "idle";
    const revision = this.revision;
    this.transition("starting");
    try {
      await play();
      if (revision !== this.revision) return "cancelled";
      this.transition("idle");
      return "started";
    } catch {
      if (revision !== this.revision) return "cancelled";
      this.transition("blocked");
      return "blocked";
    }
  }
}

type MediaInfo = Pick<
  HTMLVideoElement,
  "readyState" | "videoWidth" | "videoHeight" | "duration"
>;
export function mediaReadiness(
  media: MediaInfo,
  camera: boolean,
): "loading" | "ready" | "invalid" {
  if (media.readyState < 1 || !media.videoWidth || !media.videoHeight)
    return "loading";
  if (
    !camera &&
    (media.duration > 600 ||
      (media.readyState >= 2 && !Number.isFinite(media.duration)))
  )
    return "invalid";
  return media.readyState >= 2 ? "ready" : "loading";
}

export type CameraFailure = {
  kind: "permission" | "missing" | "busy" | "unsupported" | "unknown";
  title: string;
  detail: string;
};
export function cameraFailure(error: unknown): CameraFailure {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return {
      kind: "permission",
      title: "Camera permission is blocked",
      detail:
        "Allow camera access for this website in your browser’s website permissions, then retry. If the browser itself is blocked, allow camera access in your device settings.",
    };
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return {
      kind: "missing",
      title: "No camera is available",
      detail:
        "Connect or enable a camera, then retry. You can also choose a video from this device.",
    };
  if (name === "NotReadableError" || name === "AbortError")
    return {
      kind: "busy",
      title: "The camera couldn’t open",
      detail:
        "Another app or browser tab may be using the camera. Close it, then retry, or choose a video.",
    };
  if (name === "NotSupportedError")
    return {
      kind: "unsupported",
      title: "Camera access is unavailable",
      detail:
        "Open Ceval over HTTPS in a browser that supports camera access, or choose a video.",
    };
  return {
    kind: "unknown",
    title: "The camera couldn’t open",
    detail:
      "Check that your camera is available and this website has permission, then retry or choose a video.",
  };
}
