import type { JournalEntry, JournalPlan, JournalPolicy, JournalState } from './moderation-journal-store';

// Explicit operations only: no arbitrary method names, provider requests or automatic retries.
export interface StorageOperations {
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
