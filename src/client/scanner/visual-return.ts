import type { Box } from "../../shared/scan.ts";
import type { GrayFrame } from "./tracking.ts";

// Compare the object's pixels across a small pan when repeated textures cannot
// supply three unique tracking features. Every image region must still agree.
export function sameObjectAfterPan(
  previous: GrayFrame,
  current: GrayFrame,
  before: Box,
  after: Box,
) {
  if (previous.width !== current.width || previous.height !== current.height)
    return false;
  const { width, height } = previous;
  const points: { x: number; y: number; value: number; tile: number }[] = [];
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const px = Math.min(
        width - 1,
        Math.max(
          0,
          Math.floor((before.x + (before.width * (x + 0.5)) / 16) * width),
        ),
      );
      const py = Math.min(
        height - 1,
        Math.max(
          0,
          Math.floor((before.y + (before.height * (y + 0.5)) / 16) * height),
        ),
      );
      points.push({
        x: px,
        y: py,
        value: previous.pixels[py * width + px],
        tile: Math.floor(y / 4) * 4 + Math.floor(x / 4),
      });
    }
  const rangeX = Math.floor((width * 0.2) / 2) * 2,
    rangeY = Math.floor((height * 0.12) / 2) * 2;
  const left = after.x * width,
    right = (after.x + after.width) * width,
    top = after.y * height,
    bottom = (after.y + after.height) * height;
  for (let dy = -rangeY; dy <= rangeY; dy += 2)
    for (let dx = -rangeX; dx <= rangeX; dx += 2) {
      const x = before.x + dx / width,
        y = before.y + dy / height;
      const intersection =
        Math.max(
          0,
          Math.min(x + before.width, after.x + after.width) -
            Math.max(x, after.x),
        ) *
        Math.max(
          0,
          Math.min(y + before.height, after.y + after.height) -
            Math.max(y, after.y),
        );
      const union =
        before.width * before.height +
        after.width * after.height -
        intersection;
      if (intersection / union < 0.75) continue;
      const errors = new Float64Array(16),
        counts = new Uint8Array(16);
      let total = 0,
        count = 0,
        sum = 0,
        squares = 0,
        currentSum = 0,
        currentSquares = 0;
      for (const point of points) {
        const x = point.x + dx,
          y = point.y + dy;
        if (
          x < 0 ||
          y < 0 ||
          x >= width ||
          y >= height ||
          x < left ||
          x >= right ||
          y < top ||
          y >= bottom
        )
          continue;
        const currentValue = current.pixels[y * width + x];
        const delta = Math.abs(point.value - currentValue);
        total += delta;
        errors[point.tile] += delta;
        counts[point.tile]++;
        count++;
        sum += point.value;
        squares += point.value ** 2;
        currentSum += currentValue;
        currentSquares += currentValue ** 2;
      }
      if (
        count < 205 ||
        total / count > 5 ||
        squares / count - (sum / count) ** 2 < 150 ||
        currentSquares / count - (currentSum / count) ** 2 < 150
      )
        continue;
      if (counts.every((n, i) => n >= 8 && errors[i] / n <= 12)) return true;
    }
  return false;
}
