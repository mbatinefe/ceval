export type HistoryWrite = {
  id: string;
  productId: string;
  comparisonId?: string;
  thumbnail?: string;
  source: "camera" | "video" | "sample";
  mode: "buy" | "resale";
};
export class HistoryWriter<T extends { id: string }> {
  private queued = new Map<string, HistoryWrite>();
  private failed = new Map<string, HistoryWrite>();
  private fingerprints = new Map<string, string>();
  private canonicalIds = new Map<string, string>();
  private running = false;
  private stopped = false;
  private controller = new AbortController();
  private send: (data: HistoryWrite, signal: AbortSignal) => Promise<T>;
  onSaved?: (entry: T) => void;
  onChange?: () => void;
  constructor(send: (data: HistoryWrite, signal: AbortSignal) => Promise<T>) {
    this.send = send;
  }
  get state() {
    return {
      pending: this.queued.size + Number(this.running),
      failed: this.failed.size,
    };
  }
  enqueue(data: HistoryWrite) {
    if (this.stopped) return;
    const key = JSON.stringify(data);
    if (this.fingerprints.get(data.id) === key) return;
    this.fingerprints.set(data.id, key);
    this.failed.delete(data.id);
    this.queued.set(data.id, data);
    void this.drain();
  }
  retry() {
    for (const [id, data] of this.failed)
      if (!this.queued.has(id)) this.queued.set(id, data);
    this.failed.clear();
    void this.drain();
  }
  private async drain() {
    if (this.running || this.stopped) return;
    this.running = true;
    while (this.queued.size && !this.stopped) {
      const [id, data] = this.queued.entries().next().value!;
      this.queued.delete(id);
      this.onChange?.();
      try {
        const entry = await this.send(
          { ...data, id: this.canonicalIds.get(id) || id },
          this.controller.signal,
        );
        this.canonicalIds.set(id, entry.id);
        if (!this.stopped) this.onSaved?.(entry);
      } catch {
        if (!this.stopped && !this.queued.has(id)) this.failed.set(id, data);
      }
    }
    this.running = false;
    if (!this.stopped) this.onChange?.();
  }
  dispose() {
    this.stopped = true;
    this.controller.abort();
    this.queued.clear();
    this.onSaved = undefined;
    this.onChange = undefined;
  }
}
