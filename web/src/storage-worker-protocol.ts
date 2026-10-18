import type { RateEvent } from './rate-worker';
import type { RateSample } from './rate-series';
import type { ObservationSpan } from './observation-coverage';
import type { StreamSample } from './stream-history';
import type { Comparison } from './comparison';
import type { LedgerEvent, LedgerMeta } from './ledger-worker';
import type { LedgerRank } from './stats-ledger';
import type { StatKind } from './stats-ledger-state';
import type { LedgerLoad } from './statistics-store';
import type { StatisticsSummaryRequest, StatisticsSummaryReport } from './stats-summary';
import type { RateSnapshot } from './rate-timeline';
import type { StatisticsMove } from './statistics-records';
import type { ArchiveRetention, RetentionPlan } from './archive-retention';
import type { ChatMessage } from './protocol';
import type { ArchiveCursor, ArchivePage, ArchiveQuery, ArchiveScanPage } from './archive-records';
import type { JournalEntry, JournalPlan, JournalPolicy, JournalState } from './moderation-journal-store';

// Explicit operations only: no arbitrary method names, provider requests or automatic retries.
export interface StorageOperations {
  'summary.begin': { args: [request: Omit<StatisticsSummaryRequest, 'messages'>]; result: void };
  'summary.append': { args: [messages: readonly ChatMessage[]]; result: void };
  'summary.finish': { args: []; result: StatisticsSummaryReport };

  'rate.open': { args: [channels: readonly string[], now: number, persist: boolean]; result: void };
  'rate.batch': { args: [events: readonly RateEvent[]]; result: { from: number; to: number }[] };
  'rate.samples': { args: [now: number, seconds: number, channel: string]; result: RateSample[] };
  'rate.peaks': {
    args: [now: number, channel: string, seconds: number, kind: 'rate' | 'glorps'];
    result: RateSample[];
  };
  'rate.snapshot': { args: [now: number]; result: RateSnapshot };
  'rate.coverage': { args: [now: number]; result: ObservationSpan[] };
  'rate.comparison': {
    args: [channels: readonly string[], from: number, to: number, streams: Record<string, StreamSample[]>, now: number];
    result: Comparison;
  };
  'rate.save': { args: [now: number]; result: void };

  'ledger.open': {
    args: [channels: readonly string[], legacy: string | undefined, persist: boolean];
    result: LedgerMeta;
  };
  'ledger.batch': { args: [events: readonly LedgerEvent[]]; result: LedgerMeta };
  'ledger.ranks': {
    args: [kind: StatKind, hours: number, channel: string, excluded: readonly string[], now: number, limit: number];
    result: LedgerRank[];
  };
  'ledger.buckets': {
    args: [unit: 'hours' | 'days', channel: string, excluded: readonly string[], now: number];
    result: { at: number; count: number }[];
  };
  'ledger.snapshot': { args: [now: number]; result: unknown };
  'ledger.save': { args: [now: number]; result: string | undefined };

  'statistics.loadLedger': { args: [channels: readonly string[], legacy: string | undefined]; result: LedgerLoad };

  'statistics.summarize': { args: [request: StatisticsSummaryRequest]; result: StatisticsSummaryReport };

  'rates.read': { args: [key: string]; result: unknown };
  'rates.write': { args: [key: string, snapshot: RateSnapshot]; result: void };

  'statistics.snapshot': { args: [key: string, snapshot: unknown]; result: void };
  'statistics.read': { args: [key: string]; result: string | undefined };
  'statistics.write': { args: [key: string, raw: string]; result: void };
  'statistics.copy': { args: [plan: StatisticsMove]; result: void };

  'archive.open': { args: []; result: void };
  'archive.prune': { args: [cap: number]; result: void };
  'archive.applyRetention': { args: [plan: RetentionPlan, cap: number]; result: void };
  'archive.retentionPreview': { args: [policy: ArchiveRetention, at: number, cap: number]; result: RetentionPlan };
  'archive.append': { args: [messages: readonly ChatMessage[]]; result: void };
  'archive.recover': {
    args: [messages: readonly ChatMessage[], cap: number, policy: ArchiveRetention];
    result: number;
  };

  'archive.get': { args: [id: string, channels: readonly string[]]; result: ChatMessage | undefined };
  'archive.recent': { args: [channels: readonly string[], limit: number]; result: ChatMessage[] };
  'archive.search': { args: [query: ArchiveQuery]; result: ChatMessage[] };
  'archive.searchPage': { args: [query: ArchiveQuery, after: ArchiveCursor | undefined]; result: ArchivePage };
  'archive.scanPage': {
    args: [channel: string, after: ArchiveCursor | undefined, until: ArchiveCursor | undefined];
    result: ArchiveScanPage;
  };

  'journal.list': { args: [account: string]; result: JournalState };
  'journal.begin': { args: [account: string, receipt: JournalEntry]; result: void };
  'journal.finish': {
    args: [account: string, id: string, outcome: Exclude<JournalEntry['outcome'], 'pending'>, detail: string];
    result: boolean;
  };
  'journal.preview': { args: [account: string, policy: JournalPolicy]; result: JournalPlan };
  'journal.apply': { args: [plan: JournalPlan]; result: void };
  stop: { args: []; result: void };
}
export type StorageOperation = keyof StorageOperations;
export type StorageRequest = {
  [K in StorageOperation]: { version: 1; id: number; operation: K; args: StorageOperations[K]['args'] };
}[StorageOperation];
export type StorageReply =
  | { version: 1; id: number; ok: true; result: unknown }
  | { version: 1; id: number; ok: false; error: { name: string; message: string } };

export type ArchiveOperation = Exclude<
  Extract<StorageOperation, `archive.${string}`>,
  'archive.append' | 'archive.retentionPreview' | 'archive.open' | 'archive.prune' | 'archive.applyRetention'
>;
export interface StorageProgress {
  version: 1;
  id: number;
  progress: number;
}

export type StatisticsOperation = Extract<StorageOperation, `statistics.${string}`>;

export type RetentionOperation = 'archive.prune' | 'archive.applyRetention';
export interface StoragePolicyNotice {
  version: 1;
  id: number;
  policy: true;
}
export type StorageNotice = StorageProgress | StoragePolicyNotice;
