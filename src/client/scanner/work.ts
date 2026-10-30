type Task = (signal: AbortSignal) => Promise<void>;
type Lane = "compare" | "selection";
export class ScanWork {
  private controller = new AbortController();
  private inputOpen = false;
  private recognizing = false;
  private active = { compare: 0, selection: 0 };
  private queue: { key: string; task: Task; lane: Lane }[] = [];
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
  compare(key: string, task: Task) {
    return this.enqueue("compare", key, task);
  }
  select(key: string, task: Task) {
    return this.enqueue("selection", key, task);
  }
  private enqueue(lane: Lane, requestKey: string, task: Task) {
    const key = `${lane}:${requestKey}`;
    if (this.keys.has(key)) return true;
    if (this.keys.size >= 12) return false;
    this.keys.add(key);
    this.queue.push({ key, task, lane });
    this.onChange?.();
    this.drain();
    return true;
  }
  private drain() {
    // Price searches settle serially; model confirmation has its own single slot.
    for (const lane of ["compare", "selection"] as const) {
      if (this.active[lane]) continue;
      const index = this.queue.findIndex((job) => job.lane === lane);
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
