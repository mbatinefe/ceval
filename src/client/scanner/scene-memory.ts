import type { GrayFrame } from "./tracking.ts";

// Whole-view checks keep a known object from hiding a newly entering item.
function unchanged(a: GrayFrame, b: GrayFrame) {
  if (a.width !== b.width || a.height !== b.height) return false;
  let total = 0;
  const tiles = new Float64Array(96),
    counts = new Uint16Array(96);
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      const delta = Math.abs(
        a.pixels[y * a.width + x] - b.pixels[y * b.width + x],
      );
      const tile =
        Math.min(7, Math.floor((y * 8) / a.height)) * 12 +
        Math.min(11, Math.floor((x * 12) / a.width));
      tiles[tile] += delta;
      counts[tile]++;
      total += delta;
    }
  }
  return (
    total / a.pixels.length < 4 &&
    tiles.every((sum, i) => !counts[i] || sum / counts[i] < 12)
  );
}
export class SceneMemory {
  private views: { frame: GrayFrame; rowIds: string[] }[] = [];
  remember(frame: GrayFrame, rowIds: string[]) {
    if (!rowIds.length) return;
    this.views.unshift({
      frame: { ...frame, pixels: frame.pixels.slice() },
      rowIds: [...rowIds],
    });
    this.views.length = Math.min(this.views.length, 12);
  }
  match(frame: GrayFrame, available: Set<string>): string[] | null {
    return (
      this.views.find(
        (view) =>
          view.rowIds.every((id) => available.has(id)) &&
          unchanged(view.frame, frame),
      )?.rowIds || null
    );
  }
  clear() {
    this.views = [];
  }
}
