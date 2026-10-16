import { StorageWorkerClient } from './storage-worker-client';
import type { JournalEntry, JournalPlan, JournalPolicy, JournalState } from './moderation-journal-store';
export { journalExport, JOURNAL_BYTES } from './moderation-journal-store';
export type { JournalEntry, JournalPlan, JournalPolicy, JournalState } from './moderation-journal-store';

// The worker owns IDB and receipt validation. Callers still await durable begin
// before provider sends, and no transport failure replays a journal operation.
export class ModerationJournal {
  private storage = new StorageWorkerClient();
  list(account: string): Promise<JournalState> {
    return this.storage.request('journal.list', account);
  }
  begin(account: string, receipt: JournalEntry): Promise<void> {
    return this.storage.request('journal.begin', account, receipt);
  }
  finish(
    account: string,
    id: string,
    outcome: Exclude<JournalEntry['outcome'], 'pending'>,
    detail: string,
  ): Promise<boolean> {
    return this.storage.request('journal.finish', account, id, outcome, detail);
  }
  preview(account: string, policy: JournalPolicy): Promise<JournalPlan> {
    return this.storage.request('journal.preview', account, policy);
  }
  apply(plan: JournalPlan): Promise<void> {
    return this.storage.request('journal.apply', plan);
  }
  async stop(): Promise<void> {
    try {
      await this.storage.stop();
    } catch {
      /* Failed storage is already closed to new actions. */
    }
  }
}
