import { StatsLedgerModel } from './stats-ledger-model';
import { loadStatisticsLedger, writeStatisticsSnapshot } from './statistics-store';
import type { ChatMessage } from './protocol';
import type { Emote } from './tokens';
import type { StatKind } from './stats-ledger-state';
export type LedgerEvent =
  | { type: 'catalog'; channel: string; catalog: Record<string, Emote> }
  | { type: 'bootstrap'; messages: readonly ChatMessage[]; final: boolean }
  | { type: 'observe'; message: ChatMessage; now: number }
  | { type: 'attach'; message: ChatMessage }
  | { type: 'reconcile'; channel: string }
  | { type: 'restore'; value: unknown; now: number }
  | { type: 'prune'; now: number };
export interface LedgerMeta {
  since: number;
  limited: boolean;
  storageFailed: boolean;
}
export class LedgerWorker {
  private model: StatsLedgerModel | undefined;
  private catalogs = new Map<string, Record<string, Emote>>();
  private key = '';
  private persist = true;
  private storageFailed = false;
  private queue: Promise<unknown> = Promise.resolve();
  run<T>(work: () => Promise<T> | T): Promise<T> {
    const next = this.queue.catch(() => {}).then(work);
    this.queue = next;
    return next;
  }
  private get ledger(): StatsLedgerModel {
    if (!this.model) throw new Error('Ledger not initialized');
    return this.model;
  }
  meta(): LedgerMeta {
    return { since: this.ledger.since, limited: this.ledger.limited, storageFailed: this.storageFailed };
  }
  async open(channels: readonly string[], legacy: string | undefined, persist: boolean): Promise<LedgerMeta> {
    if (this.model) throw new Error('Ledger already initialized');
    this.key = 'chatthing:v1:stats:counts:' + channels.join(',');
    this.persist = persist;
    const loaded = await loadStatisticsLedger(channels, legacy, persist);
    this.model = new StatsLedgerModel(channels, (channel) => this.catalogs.get(channel) ?? {});
    if (loaded.state) this.model.adopt(loaded.state);
    this.storageFailed = loaded.storageFailed;
    return this.meta();
  }
  batch(events: readonly LedgerEvent[]): LedgerMeta {
    let weight = 0;
    for (const event of events) {
      weight += event.type === 'bootstrap' ? Math.max(1, event.messages.length) : 1;
      if (weight > 2000) throw new Error('Ledger batch capacity exceeded');
    }
    for (const event of events)
      switch (event.type) {
        case 'catalog':
          this.catalogs.set(event.channel, event.catalog);
          break;
        case 'bootstrap':
          this.ledger.bootstrap(event.messages, event.final);
          break;
        case 'observe':
          this.ledger.observe(event.message, event.now);
          break;
        case 'attach':
          this.ledger.attach(event.message);
          break;
        case 'reconcile':
          this.ledger.reconcile(event.channel);
          break;
        case 'restore':
          this.ledger.restore(event.value, event.now);
          break;
        case 'prune':
          this.ledger.prune(event.now);
          break;
      }
    return this.meta();
  }
  ranks(kind: StatKind, hours: number, channel: string, excluded: readonly string[], now: number, limit: number) {
    return this.ledger.ranks(kind, hours, channel, new Set(excluded), now, limit);
  }
  buckets(unit: 'hours' | 'days', channel: string, excluded: readonly string[], now: number) {
    return this.ledger.buckets(unit, channel, new Set(excluded), now);
  }
  snapshot(now: number): unknown {
    return this.ledger.snapshot(now);
  }
  async save(now: number): Promise<string | undefined> {
    const snapshot = this.ledger.snapshot(now);
    try {
      if (this.persist) await writeStatisticsSnapshot(this.key, snapshot);
      else {
        const raw = JSON.stringify(snapshot);
        if (raw.length > 6000000) throw new Error('Statistics capacity reached');
        this.storageFailed = false;
        return raw;
      }
      this.storageFailed = false;
    } catch (error) {
      this.storageFailed = true;
      throw error;
    }
  }
}
