import { frameDifference, type GrayFrame } from "./tracking.ts";

export type CapturedFrame = {
  image: string;
  gray: GrayFrame;
  time: number;
  capturedAt: number;
  position: number;
};

export class CaptureBuffer {
  private frames: CapturedFrame[] = [];
  get length() {
    return this.frames.length;
  }
  push(frame: CapturedFrame) {
    this.frames.push(frame);
    if (this.frames.length <= 9) return;
    // Keep the oldest and newest views; remove the most redundant interior view.
    let remove = 1,
      similarity = Infinity;
    for (let i = 1; i < this.frames.length - 1; i++) {
      const distance = Math.min(
        frameDifference(this.frames[i - 1].gray, this.frames[i].gray),
        frameDifference(this.frames[i].gray, this.frames[i + 1].gray),
      );
      if (distance < similarity) {
        similarity = distance;
        remove = i;
      }
    }
    this.frames.splice(remove, 1);
  }
  take() {
    return this.frames.splice(0, 3);
  }
  clear() {
    this.frames = [];
  }
}
