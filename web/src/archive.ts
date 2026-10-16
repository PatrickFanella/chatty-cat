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
  archiveKey,
  validMessage,
  type Archived,
  type ArchiveQuery,
  type ArchiveCursor,
  type ArchivePage,
} from './archive-records';
import { StorageWorkerClient } from './storage-worker-client';
export { PUBLIC_ARCHIVE_COMMANDS, archiveKey, matchesArchive } from './archive-records';
export type { ArchiveQuery, ArchiveCursor, ArchiveBounds, ArchivePage } from './archive-records';
function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Archive request failed'));
  });
}
function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('Archive transaction aborted'));
    tx.onerror = () => reject(tx.error ?? new Error('Archive transaction failed'));
  });
}
export class MessageArchive {
  private db: Promise<IDBDatabase>;
  private queue: ChatMessage[] = [];
  private flushing: Promise<void> | undefined;
  private stopped = false;
  private timer: ReturnType<typeof clockTask>;
  constructor(
    private readonly failure: (message: string) => void = () => {},
    private readonly cap = MAX_ROWS,
  ) {
    this.db = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB unavailable'));
        return;
      }
      const open = indexedDB.open('chatthing-archive', 1);
      open.onupgradeneeded = () => {
        const store = open.result.createObjectStore('messages', { keyPath: 'key' });
        store.createIndex('timestamp', 'timestamp');
        store.createIndex('channel-time', ['channel', 'timestamp']);
      };
      open.onsuccess = () => {
        open.result.onversionchange = () => open.result.close();
        resolve(open.result);
      };
      open.onerror = () => reject(open.error ?? new Error('Archive unavailable'));
      open.onblocked = () => failure('Archive upgrade is blocked by another tab; close it and reload');
    });
    void this.db.catch(() => failure('Local archive unavailable; live chat continues'));
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
    const db = await this.db;
    const batch = this.queue.splice(0);
    const tx = db.transaction('messages', 'readwrite');
    const complete = done(tx);
    const store = tx.objectStore('messages');
    for (const message of batch) {
      const key = archiveKey(message);
      store.put({ key, channel: message.channel, timestamp: message.timestamp, message } satisfies Archived);
    }
    try {
      await complete;
    } catch (error) {
      this.queue = [...batch, ...this.queue].slice(-2000);
      throw error;
    }
    await this.prune();
  }
  private async prune(): Promise<void> {
    const db = await this.db,
      tx = db.transaction('messages', 'readwrite'),
      store = tx.objectStore('messages');
    const complete = done(tx);
    const count = await request(store.count()),
      policy = readRetention();
    let remaining = count - Math.min(this.cap, policy.rows);
    const cutoff = policy.days ? Date.now() - policy.days * 86400000 : 0;
    if (remaining > 0 || cutoff > 0)
      await new Promise<void>((resolve, reject) => {
        const cursor = store.index('timestamp').openCursor();
        cursor.onerror = () => reject(cursor.error);
        cursor.onsuccess = () => {
          const row = cursor.result;
          if (!row || (remaining <= 0 && Number(row.key) >= cutoff)) {
            resolve();
            return;
          }
          row.delete();
          remaining--;
          row.continue();
        };
      });
    await complete;
  }
  private async retentionTransaction(
    policy: ArchiveRetention,
    at: number,
    apply: boolean,
    expected?: RetentionPlan,
  ): Promise<RetentionPlan> {
    const db = await this.db,
      tx = db.transaction('messages', apply ? 'readwrite' : 'readonly'),
      store = tx.objectStore('messages');
    const cap = Math.min(this.cap, policy.rows);
    const cutoff = policy.days ? at - policy.days * 86400000 : 0;
    const plan: RetentionPlan = { policy, at, rows: 0, remove: 0, oldest: null, newest: null, signature: '' };
    const entries: { key: IDBValidKey; at: number }[] = [];
    let failure: unknown,
      oldPolicy: string | null = null,
      written = false;
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(plan);
      tx.onerror = () => {
        failure = tx.error;
      };
      tx.onabort = () => {
        if (written) {
          try {
            if (localStorage.getItem(RETENTION_KEY) === JSON.stringify(policy)) {
              if (oldPolicy === null) localStorage.removeItem(RETENTION_KEY);
              else localStorage.setItem(RETENTION_KEY, oldPolicy);
            }
          } catch {
            /* Report the transaction error; policy storage may have failed independently. */
          }
        }
        reject(failure ?? tx.error ?? new Error('Retention could not be applied'));
      };
      const cursor = store.index('timestamp').openKeyCursor();
      cursor.onerror = () => {
        failure = cursor.error;
        tx.abort();
      };
      cursor.onsuccess = () => {
        const row = cursor.result;
        if (row) {
          if (typeof row.key === 'number') {
            entries.push({ key: row.primaryKey, at: row.key });
            plan.oldest ??= row.key;
            plan.newest = row.key;
          }
          row.continue();
          return;
        }
        plan.rows = entries.length;
        const age = entries.filter((e) => e.at < cutoff).length;
        plan.remove = Math.max(age, Math.max(0, entries.length - cap));
        let hash = 2166136261;
        for (const e of entries)
          for (const code of String(e.key) + ':' + e.at + ';') hash = Math.imul(hash ^ code.charCodeAt(0), 16777619);
        plan.signature = entries.length + ':' + (hash >>> 0);
        if (!apply) return;
        if (
          expected &&
          (plan.signature !== expected.signature ||
            plan.remove !== expected.remove ||
            expected.policy.rows !== policy.rows ||
            expected.policy.days !== policy.days)
        ) {
          failure = new Error('Archive changed; preview retention again before applying');
          tx.abort();
          return;
        }
        try {
          if (expected) {
            oldPolicy = localStorage.getItem(RETENTION_KEY);
            localStorage.setItem(RETENTION_KEY, JSON.stringify(policy));
            written = true;
          }
          for (const e of entries.slice(0, plan.remove)) store.delete(e.key);
        } catch (e) {
          failure = e;
          tx.abort();
        }
      };
    });
  }
  async retentionPreview(policy: ArchiveRetention = readRetention()): Promise<RetentionPlan> {
    await this.flush();
    return this.retentionTransaction(parseRetention(policy), Date.now(), false);
  }
  async applyRetention(plan: RetentionPlan): Promise<void> {
    await this.flush();
    await this.retentionTransaction(parseRetention(plan.policy), plan.at, true, plan);
  }

  private reader: StorageWorkerClient | undefined;
  private queryWorker(): StorageWorkerClient {
    if (this.stopped) throw new Error('Archive stopped');
    return (this.reader ??= new StorageWorkerClient(
      undefined,
      30000,
      'Local archive worker unavailable; reload before searching. Live chat continues.',
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
    if (signal?.aborted) throw new DOMException('Recovery cancelled', 'AbortError');
    const db = await this.db;
    if (signal?.aborted) throw new DOMException('Recovery cancelled', 'AbortError');
    const tx = db.transaction('messages', 'readwrite'),
      store = tx.objectStore('messages');
    let inserted = 0,
      failure: Error | undefined;
    return new Promise<number>((resolve, reject) => {
      const abort = () => {
        try {
          tx.abort();
        } catch {
          /* Finished transaction. */
        }
      };
      signal?.addEventListener('abort', abort, { once: true });
      const clean = () => signal?.removeEventListener('abort', abort);
      tx.oncomplete = () => {
        clean();
        resolve(inserted);
      };
      tx.onabort = () => {
        clean();
        reject(
          signal?.aborted
            ? new DOMException('Recovery cancelled', 'AbortError')
            : (failure ?? tx.error ?? new Error('Recovery failed')),
        );
      };
      tx.onerror = () => {
        clean();
        reject(tx.error ?? new Error('Recovery failed'));
      };
      const count = store.count();
      count.onsuccess = () => {
        let available = Math.max(1, Math.min(MAX_ROWS, this.cap, readRetention().rows)) - count.result;
        for (const message of new Map(messages.map((m) => [archiveKey(m), m])).values()) {
          const key = archiveKey(message);
          const existing = store.get(key);
          existing.onsuccess = () => {
            if (existing.result) return;
            if (available <= 0) {
              failure = new Error(
                'Local archive is full; keep the bookmark backup or free retained capacity before recovery',
              );
              abort();
              return;
            }
            available--;
            inserted++;
            store.add({ key, channel: message.channel, timestamp: message.timestamp, message } satisfies Archived);
          };
        }
      };
    });
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
    this.stopped = true;
    stopClockTask(this.timer);
    void this.flush()
      .then(async () => {
        await this.reader?.stop();
        (await this.db).close();
      })
      .catch(() => {});
  }
}
