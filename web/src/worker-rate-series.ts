import { StorageWorkerClient } from './storage-worker-client';
import { WorkerEvents } from './worker-events';
import type { RateEvent } from './rate-worker';
import type { ChatMessage, ServerEvent } from './protocol';
import type { StreamSample } from './stream-history';
export class WorkerRateSeries {
  private client = new StorageWorkerClient(undefined, undefined, 'Rate worker unavailable; reload to resume rates.');
  private events: WorkerEvents<RateEvent>;
  readonly ready: Promise<void>;
  private gaps: { from: number; to: number }[] = [];
  private stopping: Promise<void> | undefined;
  readonly coverage = {
    setSources: (channels: readonly string[], now = Date.now()) =>
      this.events.push({ type: 'sources', channels: [...channels], now }),
    snapshot: (now = Date.now()) => this.events.barrier(() => this.client.request('rate.coverage', now)),
  };
  constructor(channels: readonly string[]) {
    const opening = this.client.request('rate.open', channels, Date.now(), typeof indexedDB !== 'undefined');
    this.ready = opening.catch(() => {});
    this.events = new WorkerEvents(
      opening,
      async (batch) => {
        this.gaps = await this.client.request('rate.batch', batch);
      },
      () => {},
    );
  }
  observe(message: ChatMessage, live: boolean, now = Date.now()): void {
    this.events.push({ type: 'observe', message: { ...message, tags: { ...message.tags } }, live, now });
  }
  status(event: Extract<ServerEvent, { type: 'status' }>, now = Date.now()): void {
    this.events.push({ type: 'status', event: { ...event }, now });
  }
  tick(now = Date.now()): void {
    this.events.push({ type: 'tick', now });
  }
  observationGaps(): { from: number; to: number }[] {
    return this.gaps.map((gap) => ({ ...gap }));
  }
  samples(now = Date.now(), seconds = 240, channel = '') {
    return this.events.barrier(() => this.client.request('rate.samples', now, seconds, channel));
  }
  peaks(now = Date.now(), channel = '', seconds = 86400, kind: 'rate' | 'glorps' = 'rate') {
    return this.events.barrier(() => this.client.request('rate.peaks', now, channel, seconds, kind));
  }
  snapshot(now = Date.now()) {
    return this.events.barrier(() => this.client.request('rate.snapshot', now));
  }
  comparison(
    channels: readonly string[],
    from: number,
    to: number,
    streams: Record<string, StreamSample[]>,
    now = Date.now(),
  ) {
    return this.events.barrier(() => this.client.request('rate.comparison', channels, from, to, streams, now));
  }
  save(): Promise<void> {
    return this.events.barrier(() => this.client.request('rate.save', Date.now())).catch(() => {});
  }
  stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    const saved = this.save();
    return (this.stopping = this.events
      .close()
      .then(() => saved)
      .finally(() => this.client.stop())
      .catch(() => {}));
  }
}
