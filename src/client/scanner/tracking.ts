import type { Box } from "../../shared/scan.ts";
export type GrayFrame = { pixels: Uint8Array; width: number; height: number };
export function trackDetection(previous: GrayFrame, next: GrayFrame, box: Box) {
  return finishTracking(trackDetectionSteps(previous, next, box));
}
function finishTracking(steps: Generator<void, Box | null>) {
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}
function* trackDetectionSteps(
  previous: GrayFrame,
  next: GrayFrame,
  box: Box,
): Generator<void, Box | null> {
  if (frameDifference(previous, next) < 1) {
    let total = 0,
      count = 0,
      largest = 0;
    const left = Math.max(0, Math.floor(box.x * previous.width));
    const right = Math.min(
      previous.width,
      Math.ceil((box.x + box.width) * previous.width),
    );
    const top = Math.max(0, Math.floor(box.y * previous.height));
    const bottom = Math.min(
      previous.height,
      Math.ceil((box.y + box.height) * previous.height),
    );
    for (let y = top; y < bottom; y++)
      for (let x = left; x < right; x++) {
        const index = y * previous.width + x;
        const difference = Math.abs(
          previous.pixels[index] - next.pixels[index],
        );
        total += difference;
        largest = Math.max(largest, difference);
        count++;
      }
    if (count && total / count <= 0.6 && largest <= 4) return box;
  }
  return yield* trackBoxSteps(previous, next, box);
}
export class DetectionTrail {
  private frames: GrayFrame[] = [];
  begin(frame: GrayFrame) {
    this.frames = [frame];
  }
  append(frame: GrayFrame) {
    if (!this.frames.length) return;
    if (this.frames.length >= 384) this.clear();
    else this.frames.push(frame);
  }
  clear() {
    this.frames = [];
  }
  async projectMany(
    boxes: Box[],
    signal: AbortSignal,
  ): Promise<{ boxes: (Box | null)[]; frame: GrayFrame } | null> {
    const frames = this.frames;
    const current = () => !signal.aborted && frames === this.frames;
    if (!frames.length || !current()) return null;
    const positions: (Box | null)[] = [...boxes];
    let sliceStarted = performance.now();
    // Check between small feature-matching steps, leaving room below a 6ms slice.
    for (let i = 1; i < frames.length; i++) {
      for (let b = 0; b < positions.length; b++) {
        const position = positions[b];
        if (!position) continue;
        const steps = trackDetectionSteps(frames[i - 1], frames[i], position);
        for (;;) {
          if (!current()) return null;
          const step = steps.next();
          if (step.done) positions[b] = step.value;
          if (performance.now() - sliceStarted >= 4) {
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
            if (!current()) return null;
            sliceStarted = performance.now();
          }
          if (step.done) break;
        }
      }
    }
    return current()
      ? { boxes: positions, frame: frames[frames.length - 1] }
      : null;
  }
}
export function frameDifference(a: GrayFrame, b: GrayFrame): number {
  if (a.width !== b.width || a.height !== b.height) return 255;
  let sum = 0;
  for (let i = 0; i < a.pixels.length; i++)
    sum += Math.abs(a.pixels[i] - b.pixels[i]);
  return sum / a.pixels.length;
}
export function trackBox(
  previous: GrayFrame,
  next: GrayFrame,
  box: Box,
): Box | null {
  return finishTracking(trackBoxSteps(previous, next, box));
}
function* trackBoxSteps(
  previous: GrayFrame,
  next: GrayFrame,
  box: Box,
): Generator<void, Box | null> {
  if (previous.width !== next.width || previous.height !== next.height)
    return null;
  const { width, height } = previous;
  const shifts: { x: number; y: number }[] = [];
  const fractions = [0.15, 0.3, 0.5, 0.7, 0.85];
  const points = fractions.flatMap((fx) => fractions.map((fy) => [fx, fy]));
  const features: {
    x: number;
    y: number;
    patch: number[];
    variance: number;
  }[] = [];
  for (const [fx, fy] of points) {
    const x = Math.round((box.x + box.width * fx) * width),
      y = Math.round((box.y + box.height * fy) * height);
    if (x < 12 || y < 12 || x >= width - 12 || y >= height - 12) continue;
    const patch: number[] = [];
    for (let py = -3; py <= 3; py++)
      for (let px = -3; px <= 3; px++)
        patch.push(previous.pixels[(y + py) * width + x + px]);
    const mean = patch.reduce((a, b) => a + b, 0) / 49;
    const variance = patch.reduce((a, b) => a + (b - mean) ** 2, 0) / 49;
    if (variance < 100) continue;
    features.push({ x, y, patch, variance });
  }
  features.sort((a, b) => b.variance - a.variance);
  const selected: typeof features = [];
  for (const feature of features) {
    if (
      selected.some(
        (other) => Math.hypot(other.x - feature.x, other.y - feature.y) < 7,
      )
    )
      continue;
    selected.push(feature);
    if (selected.length >= 9) break;
  }
  for (const { x, y, patch } of selected) {
    yield;
    const scores: { x: number; y: number; error: number }[] = [];
    for (let dy = -8; dy <= 8; dy++)
      for (let dx = -8; dx <= 8; dx++) {
        let error = 0,
          i = 0;
        for (let py = -3; py <= 3; py++)
          for (let px = -3; px <= 3; px++)
            error += Math.abs(
              patch[i++] - next.pixels[(y + dy + py) * width + x + dx + px],
            );
        scores.push({ x: dx, y: dy, error: error / 49 });
      }
    scores.sort((a, b) => a.error - b.error);
    const best = scores[0];
    const alternate = scores.find(
      (s) => Math.abs(s.x - best.x) > 2 || Math.abs(s.y - best.y) > 2,
    );
    if (best.error > 22 || !alternate || alternate.error < best.error * 1.3 + 2)
      continue;
    shifts.push(best);
  }
  if (shifts.length < 3) return null;
  const median = (values: number[]) =>
    values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const dx = median(shifts.map((s) => s.x)),
    dy = median(shifts.map((s) => s.y));
  if (
    shifts.filter((s) => Math.abs(s.x - dx) <= 2 && Math.abs(s.y - dy) <= 2)
      .length < Math.max(3, Math.ceil(shifts.length * 0.6))
  )
    return null;
  const moved = { ...box, x: box.x + dx / width, y: box.y + dy / height };
  if (
    moved.x < 0 ||
    moved.y < 0 ||
    moved.x + moved.width > 1 ||
    moved.y + moved.height > 1
  )
    return null;
  return moved;
}
