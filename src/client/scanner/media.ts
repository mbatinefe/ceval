import type { GrayFrame } from "./tracking";
export function grayFrame(video: HTMLVideoElement): GrayFrame {
  const canvas = document.createElement("canvas");
  const scale = 160 / Math.max(video.videoWidth, video.videoHeight);
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context)
    throw new Error("Video analysis is unavailable in this browser.");
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const pixels = new Uint8Array(canvas.width * canvas.height);
  for (let i = 0; i < pixels.length; i++)
    pixels[i] = Math.round(
      rgba[i * 4] * 0.299 + rgba[i * 4 + 1] * 0.587 + rgba[i * 4 + 2] * 0.114,
    );
  return { pixels, width: canvas.width, height: canvas.height };
}
export function captureFrame(video: HTMLVideoElement): string {
  if (video.readyState < 2 || !video.videoWidth)
    throw new Error("Wait for the video to load before scanning.");
  const canvas = document.createElement("canvas");
  const scale = Math.min(
    1,
    1024 / Math.max(video.videoWidth, video.videoHeight),
  );
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const context = canvas.getContext("2d");
  if (!context)
    throw new Error("Video analysis is unavailable in this browser.");
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.72, 0.5, 0.3]) {
    const frame = canvas.toDataURL("image/jpeg", quality);
    if (frame.startsWith("data:image/jpeg;") && frame.length < 266680)
      return frame;
  }
  throw new Error("This frame is too detailed. Move closer to one product.");
}
export function videoFileError(file: File): string | null {
  if (
    !file.type.startsWith("video/") &&
    !/\.(mp4|mov|m4v|webm)$/i.test(file.name)
  )
    return "Choose a video file, such as an MP4 or MOV.";
  if (file.size > 150 * 1024 * 1024)
    return "Choose a video smaller than 150 MB.";
  if (!file.size) return "This video is empty. Choose another file.";
  return null;
}
export async function scanRequest<T>(
  path: string,
  body: unknown,
  signal: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      data.error || "Analysis could not finish. Please try again.",
    );
  return data as T;
}
