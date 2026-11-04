import { MAX_HISTORY_ENTRIES } from "../../shared/history.ts";

type Task = (signal: AbortSignal) => Promise<void>;
type Lane = "compare" | "selection";
// One price lookup, photo match and model confirmation per retained find.
export const MAX_PENDING_SCAN_WORK = MAX_HISTORY_ENTRIES * 3;
export class ScanWork {
  private controller = new AbortController();
  private inputOpen = false;
  private recognizing = false;
  private active = { compare: 0, selection: 0 };
  private queue: {
    key: string;
    task: Task;
    lane: Lane;
    priority: number;
    current: () => boolean;
  }[] = [];
  private keys = new Set<string>();
  onChange?: () => void;
  onError?: (error: unknown) => void;
  get state() {
    return {
      recognizing: this.recognizing,
      pending: this.keys.size,
      draining: !this.inputOpen && (this.recognizing || this.keys.size > 0),
    };
  }
  start() {
    this.cancel();
    this.inputOpen = true;
    this.onChange?.();
  }
  resume() {
    this.inputOpen = true;
    this.onChange?.();
  }
  cancel() {
    this.controller.abort();
    this.controller = new AbortController();
    this.inputOpen = false;
    this.recognizing = false;
    this.active = { compare: 0, selection: 0 };
    this.queue = [];
    this.keys.clear();
    this.onChange?.();
  }
  finishInput() {
    this.inputOpen = false;
    this.onChange?.();
  }
  async recognize(task: Task) {
    if (!this.inputOpen || this.recognizing) return;
    const controller = this.controller;
    this.recognizing = true;
    this.onChange?.();
    try {
      await task(controller.signal);
    } catch (error) {
      if (controller === this.controller) this.finishInput();
      throw error;
    } finally {
      if (controller === this.controller) {
        this.recognizing = false;
        this.onChange?.();
      }
    }
  }
  compare(
    key: string,
    task: Task,
    kind: "price" | "photo" = "price",
    current = () => true,
  ) {
    return this.enqueue(
      "compare",
      key,
      task,
      kind === "price" ? 1 : 0,
      current,
    );
  }
  select(key: string, task: Task, current = () => true) {
    return this.enqueue("selection", key, task, 1, current);
  }
  private enqueue(
    lane: Lane,
    requestKey: string,
    task: Task,
    priority: number,
    current: () => boolean,
  ) {
    this.prune();
    const key = `${lane}:${requestKey}`;
    if (this.keys.has(key)) return true;
    if (this.keys.size >= MAX_PENDING_SCAN_WORK) return false;
    this.keys.add(key);
    this.queue.push({ key, task, lane, priority, current });
    this.onChange?.();
    this.drain();
    return true;
  }
  private prune() {
    const previous = this.queue.length;
    this.queue = this.queue.filter((job) => {
      if (job.current()) return true;
      this.keys.delete(job.key);
      return false;
    });
    if (this.queue.length !== previous) this.onChange?.();
  }
  private drain() {
    this.prune();
    // Two price searches can progress; model confirmation keeps its own slot.
    for (const lane of ["compare", "selection"] as const) {
      const limit = lane === "compare" ? 2 : 1;
      if (this.active[lane] >= limit) continue;
      const preferred = this.queue.findIndex(
        (job) => job.lane === lane && job.priority > 0,
      );
      const index =
        preferred >= 0
          ? preferred
          : this.queue.findIndex((job) => job.lane === lane);
      if (index < 0) continue;
      const job = this.queue.splice(index, 1)[0],
        controller = this.controller;
      this.active[lane]++;
      void (async () => {
        try {
          await job.task(controller.signal);
        } catch (error) {
          if (controller === this.controller) this.onError?.(error);
        } finally {
          if (controller === this.controller) {
            this.active[lane]--;
            this.keys.delete(job.key);
            this.onChange?.();
            this.drain();
          }
        }
      })();
    }
  }
}
