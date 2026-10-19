// One bounded batch at a time. No polling clock and no automatic replay after failure.
export class WorkerEvents<T> {
  private queued: { value?: T; weight: number; work?: () => Promise<void> }[] = [];
  private weight = 0;
  private running: Promise<void> | undefined;
  private failure: unknown;
  private stopped = false;
  private barriers = 0;
  constructor(
    private ready: Promise<unknown>,
    private send: (batch: T[]) => Promise<unknown>,
    private failed: () => void,
    private capacity = 100000,
  ) {}
  push(value: T, weight = 1): void {
    if (this.stopped || this.failure) return;
    if (this.weight + weight > this.capacity) {
      this.failure = new Error('Observation queue capacity reached; reload required');
      this.queued = [];
      this.weight = 0;
      this.failed();
      return;
    }
    this.queued.push({ value, weight });
    this.weight += weight;
    queueMicrotask(() => {
      void this.flush().catch(() => {});
    });
  }
  barrier<R>(work: () => Promise<R>): Promise<R> {
    if (this.failure || this.stopped) return Promise.reject(this.failure ?? new Error('Worker stopped'));
    if (this.barriers >= 64) return Promise.reject(new Error('Worker query queue busy'));
    this.barriers++;
    return new Promise<R>((resolve, reject) => {
      this.queued.push({
        weight: 0,
        work: async () => {
          try {
            resolve(await work());
          } catch (error) {
            reject(error);
          } finally {
            this.barriers--;
          }
        },
      });
      void this.flush().catch(reject);
    });
  }
  flush(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.drain()
      .catch((error) => {
        this.failure = error;
        this.failed();
        throw error;
      })
      .finally(() => {
        this.running = undefined;
        if (this.queued.length && !this.failure)
          queueMicrotask(() => {
            void this.flush().catch(() => {});
          });
      });
    return this.running;
  }
  private async drain(): Promise<void> {
    await this.ready;
    if (this.failure) throw this.failure;
    while (this.queued.length) {
      if (this.queued[0]!.work) {
        await this.queued.shift()!.work!();
        continue;
      }
      let size = 0,
        weight = 0;
      while (size < this.queued.length && !this.queued[size]!.work && weight + this.queued[size]!.weight <= 2000)
        weight += this.queued[size++]!.weight;
      const batch = this.queued.splice(0, size);
      this.weight -= weight;
      await this.send(batch.map((row) => row.value!));
      if (this.failure) throw this.failure;
    }
  }
  async close(): Promise<void> {
    this.stopped = true;
    await this.flush();
  }
}
