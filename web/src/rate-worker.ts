import { RateSeries } from './rate-series';
import { RateStore } from './rate-store';
import type { ChatMessage, ServerEvent } from './protocol';
export type RateEvent =
  | { type: 'observe'; message: ChatMessage; live: boolean; now: number }
  | { type: 'status'; event: Extract<ServerEvent, { type: 'status' }>; now: number }
  | { type: 'tick'; now: number }
  | { type: 'sources'; channels: readonly string[]; now: number };
export class RateWorker {
  private model: RateSeries | undefined;
  private storeInstance: RateStore | undefined;
  private get store(): RateStore {
    return (this.storeInstance ??= new RateStore());
  }
  private key = '';
  private persist = true;
  private queue: Promise<unknown> = Promise.resolve();
  run<T>(work: () => Promise<T> | T): Promise<T> {
    const next = this.queue.catch(() => {}).then(work);
    this.queue = next;
    return next;
  }
  get series(): RateSeries {
    if (!this.model) throw new Error('Rates not initialized');
    return this.model;
  }
  async open(channels: readonly string[], now: number, persist: boolean): Promise<void> {
    if (this.model) throw new Error('Rates already initialized');
    this.model = new RateSeries(channels, now);
    this.key = channels.join(',');
    this.persist = persist;
    if (persist)
      try {
        this.model.restore(await this.store.read(this.key));
      } catch {
        /* Live worker observations remain available. */
      }
  }
  batch(events: readonly RateEvent[]): { from: number; to: number }[] {
    if (events.length > 2000) throw new Error('Rate batch capacity exceeded');
    for (const event of events)
      switch (event.type) {
        case 'observe':
          this.series.observe(event.message, event.live, event.now);
          break;
        case 'status':
          this.series.status(event.event, event.now);
          break;
        case 'tick':
          this.series.tick(event.now);
          break;
        case 'sources':
          this.series.coverage.setSources(event.channels, event.now);
          break;
      }
    return this.series.observationGaps();
  }
  async save(now: number): Promise<void> {
    const snapshot = this.series.snapshot(now);
    if (this.persist) await this.store.write(this.key, snapshot);
  }
  async stop(): Promise<void> {
    await this.queue.catch(() => {});
    await this.storeInstance?.stop();
  }
}
