import type { Box } from "../../shared/scan.ts";
export type GrayFrame = { pixels: Uint8Array; width: number; height: number };
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
  if (previous.width !== next.width || previous.height !== next.height)
    return null;
  const { width, height } = previous;
  const shifts: { x: number; y: number }[] = [];
  const points = [
    [0.3, 0.3],
    [0.7, 0.3],
    [0.5, 0.5],
    [0.3, 0.7],
    [0.7, 0.7],
  ];
  for (const [fx, fy] of points) {
    const x = Math.round((box.x + box.width * fx) * width),
      y = Math.round((box.y + box.height * fy) * height);
    if (x < 12 || y < 12 || x >= width - 12 || y >= height - 12) continue;
    const patch: number[] = [];
    for (let py = -3; py <= 3; py++)
      for (let px = -3; px <= 3; px++)
        patch.push(previous.pixels[(y + py) * width + x + px]);
    const mean = patch.reduce((a, b) => a + b, 0) / 49;
    if (patch.reduce((a, b) => a + (b - mean) ** 2, 0) / 49 < 100) continue;
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
      .length < 3
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
