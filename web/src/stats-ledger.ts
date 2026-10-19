import { StorageWorkerClient } from './storage-worker-client';
import { WorkerEvents } from './worker-events';
import type { LedgerEvent, LedgerMeta } from './ledger-worker';
import type { ChatMessage } from './protocol';
import type { Emote } from './tokens';
import type { StatKind } from './stats-ledger-state';
export type { StatKind } from './stats-ledger-state';
export interface LedgerRank {
  name: string;
  count: number;
}
export class StatsLedger {
  private client = new StorageWorkerClient(
    undefined,
    undefined,
    'Statistics ledger worker unavailable; reload before saving counts.',
  );
  private events: WorkerEvents<LedgerEvent>;
  private catalogs = new Map<string, Record<string, Emote>>();
  private key: string;
  private persist = typeof indexedDB !== 'undefined';
  private loading = true;
  private unavailable = false;
  private stopping: Promise<void> | undefined;
  readonly ready: Promise<void>;
  since = Date.now();
  limited = false;
  storageFailed = false;
  get storageLoading(): boolean {
    return this.loading;
  }
  get storageRestoreUnavailable(): boolean {
    return this.unavailable;
  }
  constructor(
    private channels: readonly string[],
    private emotes: (channel: string) => Record<string, Emote>,
  ) {
    this.key = 'chatthing:v1:stats:counts:' + channels.join(',');
    let legacy: string | undefined;
    try {
      const raw = localStorage.getItem(this.key);
      if (raw) {
        if (raw.length > 6000000) this.storageFailed = true;
        else legacy = raw;
      }
    } catch {
      this.storageFailed = true;
    }
    const opening = this.client.request('ledger.open', channels, legacy, this.persist).then((meta) => this.meta(meta));
    this.ready = opening
      .catch(() => {
        this.unavailable = this.storageFailed = true;
      })
      .finally(() => {
        this.loading = false;
      });
    this.events = new WorkerEvents(
      opening,
      async (batch) => this.meta(await this.client.request('ledger.batch', batch)),
      () => {
        this.unavailable = this.storageFailed = true;
      },
      102000, // One metadata batch beyond the 100k bootstrap rows.
    );
  }
  private meta(meta: LedgerMeta): void {
    this.since = meta.since;
    this.limited ||= meta.limited;
    this.storageFailed ||= meta.storageFailed;
  }
  private catalog(channel: string): void {
    const catalog = this.emotes(channel),
      old = this.catalogs.get(channel);
    if (old === catalog) return;
    if (old && !Object.keys(old).length && !Object.keys(catalog).length) return;
    this.catalogs.set(channel, catalog);
    this.events.push({ type: 'catalog', channel, catalog });
  }
  bootstrap(messages: readonly ChatMessage[]): void {
    for (const channel of this.channels) this.catalog(channel);
    if (messages.length > 100000) {
      this.limited = true;
      this.events.push({ type: 'bootstrap', messages: [], final: true }, 102001);
      return;
    }
    if (!messages.length) this.events.push({ type: 'bootstrap', messages: [], final: true });
    for (let i = 0; i < messages.length; i += 2000)
      this.events.push(
        { type: 'bootstrap', messages: messages.slice(i, i + 2000), final: i + 2000 >= messages.length },
        Math.min(2000, messages.length - i),
      );
  }
  observe(message: ChatMessage, now = Date.now()): void {
    this.catalog(message.channel);
    this.events.push({ type: 'observe', message: { ...message, tags: { ...message.tags } }, now });
  }
  attach(message: ChatMessage): void {
    this.events.push({ type: 'attach', message: { ...message, tags: { ...message.tags } } });
  }
  reconcile(channel: string): void {
    this.catalog(channel);
    this.events.push({ type: 'reconcile', channel });
  }
  restore(value: unknown, now = Date.now()): void {
    this.events.push({ type: 'restore', value, now });
  }
  prune(now = Date.now()): void {
    this.events.push({ type: 'prune', now });
  }
  ranks(
    kind: StatKind,
    hours: number,
    channel = '',
    excluded: ReadonlySet<string> = new Set(),
    now = Date.now(),
    limit = 50,
  ): Promise<LedgerRank[]> {
    return this.events.barrier(() =>
      this.client.request('ledger.ranks', kind, hours, channel, [...excluded], now, limit),
    );
  }
  buckets(
    unit: 'hours' | 'days',
    channel = '',
    excluded: ReadonlySet<string> = new Set(),
    now = Date.now(),
  ): Promise<{ at: number; count: number }[]> {
    return this.events.barrier(() => this.client.request('ledger.buckets', unit, channel, [...excluded], now));
  }
  snapshot(now = Date.now()): Promise<unknown> {
    return this.events.barrier(() => this.client.request('ledger.snapshot', now));
  }
  save(): Promise<void> {
    return this.events
      .barrier(async () => {
        if (this.unavailable) return;
        const raw = await this.client.request('ledger.save', Date.now());
        if (raw !== undefined) localStorage.setItem(this.key, raw);
        this.storageFailed = false;
      })
      .catch(() => {
        this.storageFailed = true;
      });
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
