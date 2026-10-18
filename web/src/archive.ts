import { clockTask, stopClockTask } from './shell/clock';
import {
  readRetention,
  parseRetention,
  RETENTION_KEY,
  type ArchiveRetention,
  type RetentionPlan,
} from './archive-retention';
import type { ChatMessage } from './protocol';
import {
  MAX_ROWS,
  PUBLIC_ARCHIVE_COMMANDS,
  validMessage,
  type ArchiveQuery,
  type ArchiveCursor,
  type ArchivePage,
} from './archive-records';
import { StorageWorkerClient } from './storage-worker-client';
export { PUBLIC_ARCHIVE_COMMANDS, archiveKey, matchesArchive } from './archive-records';
export type { ArchiveQuery, ArchiveCursor, ArchiveBounds, ArchivePage } from './archive-records';
export class MessageArchive {
  private queue: ChatMessage[] = [];
  private flushing: Promise<void> | undefined;
  private stopped = false;
  private timer: ReturnType<typeof clockTask>;
  constructor(
    private readonly failure: (message: string) => void = () => {},
    private readonly cap = MAX_ROWS,
  ) {
    void this.storageWorker()
      .request('archive.open')
      .catch(() => failure('Local archive unavailable; live chat continues'));
    this.timer = clockTask(
      'storage.archive',
      () => {
        void this.flush().catch(() => failure('Archive could not save messages; live chat continues'));
      },
      3000,
      { pool: 'storage', flushOnHide: true },
    );
  }
  add(message: ChatMessage): void {
    if (this.stopped || !PUBLIC_ARCHIVE_COMMANDS.includes(message.command)) return;
    this.queue.push(message);
    if (this.queue.length > 2000) {
      this.queue.shift();
      this.failure('Archive backlog is full; some messages could not be saved');
    }
  }
  async flush(): Promise<void> {
    if (this.flushing) {
      await this.flushing;
      if (this.queue.length) await this.flush();
      return;
    }
    if (!this.queue.length) return;
    this.flushing = this.write();
    try {
      await this.flushing;
    } finally {
      this.flushing = undefined;
    }
  }
  private async write(): Promise<void> {
    const batch = this.queue.splice(0);
    try {
      await this.storageWorker().request('archive.append', batch);
    } catch (error) {
      this.queue = [...batch, ...this.queue].slice(-2000);
      throw error;
    }
    await this.prune();
  }
  private async prune(): Promise<void> {
    await this.storageWorker().retention('archive.prune', [this.cap], () => readRetention());
  }
  async retentionPreview(policy: ArchiveRetention = readRetention()): Promise<RetentionPlan> {
    await this.flush();
    return this.queryWorker().request('archive.retentionPreview', parseRetention(policy), Date.now(), this.cap);
  }
  async applyRetention(plan: RetentionPlan): Promise<void> {
    await this.flush();
    const reviewed = structuredClone(plan),
      policy = parseRetention(reviewed.policy),
      encoded = JSON.stringify(policy);
    let previous: string | null = null,
      written = false;
    try {
      await this.queryWorker().retention('archive.applyRetention', [reviewed, this.cap], () => {
        previous = localStorage.getItem(RETENTION_KEY);
        localStorage.setItem(RETENTION_KEY, encoded);
        written = true;
        return policy;
      });
    } catch (error) {
      if (written && error instanceof Error && error.name === 'StorageWorkerUnavailable') {
        throw Object.assign(
          new Error(
            'Retention outcome uncertain; reload and inspect the archive before another reduction. The selected policy remains saved.',
          ),
          { name: error.name },
        );
      }
      if (written) {
        try {
          if (localStorage.getItem(RETENTION_KEY) === encoded) {
            if (previous === null) localStorage.removeItem(RETENTION_KEY);
            else localStorage.setItem(RETENTION_KEY, previous);
          }
        } catch {
          /* Policy storage may fail independently; report the transaction error. */
        }
      }
      throw error;
    }
  }

  private reader: StorageWorkerClient | undefined;
  private queryWorker(): StorageWorkerClient {
    if (this.stopped) throw new Error('Archive stopped');
    return this.storageWorker();
  }
  private storageWorker(): StorageWorkerClient {
    return (this.reader ??= new StorageWorkerClient(
      undefined,
      30000,
      'Local archive worker unavailable; reload before another archive operation. Live chat continues.',
    ));
  }
  async get(id: string, channels: readonly string[]): Promise<ChatMessage | undefined> {
    await this.flush();
    return this.queryWorker().request('archive.get', id, channels);
  }
  async recent(channels: readonly string[], limit: number, signal?: AbortSignal): Promise<ChatMessage[]> {
    await this.flush();
    return this.queryWorker().query('archive.recent', [channels, limit], { signal });
  }
  async search(query: ArchiveQuery, signal?: AbortSignal): Promise<ChatMessage[]> {
    await this.flush();
    return this.queryWorker().query('archive.search', [query], { signal });
  }
  async recoverMissing(messages: readonly ChatMessage[], signal?: AbortSignal): Promise<number> {
    if (messages.length > 6 || messages.some((m) => !PUBLIC_ARCHIVE_COMMANDS.includes(m.command) || !validMessage(m)))
      throw new Error('Recover at most six public excerpts');
    await this.flush();
    return this.queryWorker().query('archive.recover', [messages, this.cap, readRetention()], { signal });
  }
  // Bounded chronological pages give the caller cancellation and backpressure.
  async scanChannel(channel: string, visit: (message: ChatMessage) => void, signal?: AbortSignal): Promise<void> {
    await this.flush();
    let after: ArchiveCursor | undefined, until: ArchiveCursor | undefined;
    do {
      const page = await this.queryWorker().query('archive.scanPage', [channel, after, until], { signal });
      for (const message of page.messages) {
        if (signal?.aborted) throw new DOMException('Search cancelled', 'AbortError');
        visit(message);
      }
      after = page.next;
      until = page.until;
    } while (after);
  }
  async searchPage(
    query: ArchiveQuery,
    after?: ArchiveCursor,
    signal?: AbortSignal,
    progress: (scanned: number) => void = () => {},
  ): Promise<ArchivePage> {
    await this.flush();
    return this.queryWorker().query('archive.searchPage', [query, after], { signal, progress });
  }
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    stopClockTask(this.timer);
    void this.flush()
      .catch(() => {})
      .then(() => this.reader?.stop())
      .catch(() => {});
  }
}
