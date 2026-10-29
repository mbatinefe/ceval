type Task = (signal: AbortSignal) => Promise<void>;
export class ScanWork {
  private controller = new AbortController();
  private inputOpen = false;
  private recognizing = false;
  private active = 0;
  private queue: { key: string; task: Task }[] = [];
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
    this.active = 0;
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
    } finally {
      if (controller === this.controller) {
        this.recognizing = false;
        this.onChange?.();
      }
    }
  }
  compare(key: string, task: Task) {
    if (this.keys.has(key)) return true;
    if (this.keys.size >= 12) return false;
    this.keys.add(key);
    this.queue.push({ key, task });
    this.onChange?.();
    this.drain();
    return true;
  }
  private drain() {
    while (this.active < 2 && this.queue.length) {
      const job = this.queue.shift()!,
        controller = this.controller;
      this.active++;
      void (async () => {
        try {
          await job.task(controller.signal);
        } catch (error) {
          if (controller === this.controller) this.onError?.(error);
        } finally {
          if (controller === this.controller) {
            this.active--;
            this.keys.delete(job.key);
            this.onChange?.();
            this.drain();
          }
        }
      })();
    }
  }
}
