import { ownedInterval, clearOwnedInterval } from './resource-timers';
import {
  readRetention,
  parseRetention,
  RETENTION_KEY,
  type ArchiveRetention,
  type RetentionPlan,
} from './archive-retention';
import { parseEvent, type ChatMessage } from './protocol';
interface Archived {
  key: string;
  channel: string;
  timestamp: number;
  message: ChatMessage;
}
export interface ArchiveQuery {
  text: string;
  channel?: string;
  channels?: readonly string[];
  login?: string;
  before?: number;
  after?: number;
  limit?: number;
  order?: 'oldest' | 'newest';
  matches?: (message: ChatMessage) => boolean;
}
export interface ArchiveCursor {
  timestamp: number;
  key: string;
}
export interface ArchiveBounds {
  rows: number;
  oldest: number | undefined;
  newest: number | undefined;
}
export interface ArchivePage {
  messages: ChatMessage[];
  next: ArchiveCursor | undefined;
  scanned: number;
  bounds: ArchiveBounds;
}
const MAX_ROWS = 100000;
export const PUBLIC_ARCHIVE_COMMANDS = ['PRIVMSG', 'USERNOTICE', 'NOTICE', 'CLEARCHAT', 'CLEARMSG'];
export function archiveKey(message: ChatMessage): string {
  return (
    message.channel +
    ':' +
    (message.id ||
      [message.command, message.timestamp, message.login, message.text, message.tags['system-msg'] ?? ''].join(':'))
  );
}
function validMessage(value: unknown): ChatMessage | undefined {
  const event = parseEvent(JSON.stringify({ type: 'message', message: value, replay: true }));
  return event?.type === 'message' && PUBLIC_ARCHIVE_COMMANDS.includes(event.message.command)
    ? event.message
    : undefined;
}
export function matchesArchive(message: ChatMessage, query: ArchiveQuery): boolean {
  return (
    (!query.channel || message.channel === query.channel) &&
    (!query.channels || query.channels.includes(message.channel)) &&
    (!query.login || message.login.toLowerCase() === query.login.toLowerCase()) &&
    (query.before === undefined || message.timestamp <= query.before) &&
    (query.after === undefined || message.timestamp >= query.after) &&
    (!query.text.trim() ||
      (message.text + ' ' + (message.tags['system-msg'] ?? ''))
        .toLowerCase()
        .includes(query.text.trim().toLowerCase())) &&
    (!query.matches || query.matches(message))
  );
}
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
  private timer: ReturnType<typeof setInterval>;
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
    this.timer = ownedInterval(
      'storage.archive',
      () => {
        void this.flush().catch(() => failure('Archive could not save messages; live chat continues'));
      },
      3000,
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

  async get(id: string, channels: readonly string[]): Promise<ChatMessage | undefined> {
    await this.flush();
    const db = await this.db;
    const tx = db.transaction('messages', 'readonly');
    const complete = done(tx);
    const values = await Promise.all(
      channels.map(
        (channel) => request(tx.objectStore('messages').get(channel + ':' + id)) as Promise<Archived | undefined>,
      ),
    );
    await complete;
    return values.flatMap((value) => {
      const message = value ? validMessage(value.message) : undefined;
      return message ? [message] : [];
    })[0];
  }
  async recent(channels: readonly string[], limit: number, signal?: AbortSignal): Promise<ChatMessage[]> {
    return (await this.read({ text: '', limit }, signal, new Set(channels), MAX_ROWS)).reverse();
  }
  async search(query: ArchiveQuery, signal?: AbortSignal): Promise<ChatMessage[]> {
    return this.read(query, signal);
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
  // Visit retained channel records in chronological order without retaining a full scan.
  async scanChannel(channel: string, visit: (message: ChatMessage) => void, signal?: AbortSignal): Promise<void> {
    await this.read(
      {
        text: '',
        channel,
        order: 'oldest',
        matches: (message) => {
          visit(message);
          return false;
        },
      },
      signal,
    );
  }
  async searchPage(
    query: ArchiveQuery,
    after?: ArchiveCursor,
    signal?: AbortSignal,
    progress: (scanned: number) => void = () => {},
  ): Promise<ArchivePage> {
    await this.flush();
    if (signal?.aborted) throw new DOMException('Search cancelled', 'AbortError');
    const db = await this.db;
    if (signal?.aborted) throw new DOMException('Search cancelled', 'AbortError');
    const tx = db.transaction('messages', 'readonly'),
      store = tx.objectStore('messages'),
      index = store.index('timestamp');
    const limit = Math.max(1, Math.min(100, Math.floor(query.limit ?? 100))),
      messages: ChatMessage[] = [];
    const page: ArchivePage = {
      messages,
      next: undefined,
      scanned: 0,
      bounds: { rows: 0, oldest: undefined, newest: undefined },
    };
    return new Promise<ArchivePage>((resolve, reject) => {
      const cancelled = () => new DOMException('Search cancelled', 'AbortError');
      const abort = () => {
        try {
          tx.abort();
        } catch {
          /* Transaction may have just completed. */
        }
      };
      signal?.addEventListener('abort', abort, { once: true });
      const clean = () => signal?.removeEventListener('abort', abort);
      tx.oncomplete = () => {
        clean();
        signal?.aborted ? reject(cancelled()) : resolve(page);
      };
      tx.onabort = () => {
        clean();
        reject(signal?.aborted ? cancelled() : (tx.error ?? new Error('Archive scan aborted')));
      };
      tx.onerror = () => {
        clean();
        reject(tx.error ?? new Error('Archive scan failed'));
      };
      const count = store.count();
      count.onsuccess = () => {
        page.bounds.rows = count.result;
      };
      const oldest = index.openKeyCursor();
      oldest.onsuccess = () => {
        if (typeof oldest.result?.key === 'number') page.bounds.oldest = oldest.result.key;
      };
      const newest = index.openKeyCursor(undefined, 'prev');
      newest.onsuccess = () => {
        if (typeof newest.result?.key === 'number') page.bounds.newest = newest.result.key;
      };
      const lower = Math.max(0, query.after ?? 0),
        upper = Math.min(8640000000000000, query.before ?? 8640000000000000, after?.timestamp ?? Infinity);
      if (lower > upper) return;
      const cursor = index.openCursor(IDBKeyRange.bound(lower, upper), 'prev');
      let last: ArchiveCursor | undefined;
      cursor.onsuccess = () => {
        if (signal?.aborted) {
          abort();
          return;
        }
        const row = cursor.result;
        if (!row) return;
        if (typeof row.key !== 'number' || typeof row.primaryKey !== 'string') {
          row.continue();
          return;
        }
        const position = { timestamp: row.key, key: row.primaryKey };
        if (after && position.timestamp === after.timestamp && position.key >= after.key) {
          row.continue();
          return;
        }
        page.scanned++;
        if (page.scanned % 250 === 0) progress(page.scanned);
        if (signal?.aborted) {
          abort();
          return;
        }
        const record: unknown = row.value;
        const message =
          record && typeof record === 'object' && 'message' in record ? validMessage(record.message) : undefined;
        if (message && matchesArchive(message, query)) {
          if (messages.length === limit) {
            page.next = last;
            return;
          }
          messages.push(message);
          last = position;
        }
        row.continue();
      };
    });
  }
  private async read(
    query: ArchiveQuery,
    signal?: AbortSignal,
    channels?: Set<string>,
    max = 500,
  ): Promise<ChatMessage[]> {
    await this.flush();
    if (signal?.aborted) throw new DOMException('Search cancelled', 'AbortError');
    const db = await this.db;
    const tx = db.transaction('messages', 'readonly');
    const complete = done(tx);
    const source = tx.objectStore('messages');
    const index = query.channel ? source.index('channel-time') : source.index('timestamp');
    const lower = Math.max(0, query.after ?? 0);
    const upper = Math.min(8640000000000000, query.before ?? 8640000000000000);
    if (lower > upper) {
      await complete;
      return [];
    }
    const range = query.channel
      ? IDBKeyRange.bound([query.channel, lower], [query.channel, upper])
      : IDBKeyRange.bound(lower, upper);
    const results: ChatMessage[] = [];
    const limit = Math.max(1, Math.min(max, Number.isFinite(query.limit) ? Math.floor(query.limit ?? 100) : 100));
    await new Promise<void>((resolve, reject) => {
      const cursor = index.openCursor(range, query.order === 'oldest' ? 'next' : 'prev');
      cursor.onerror = () => reject(cursor.error);
      cursor.onsuccess = () => {
        if (signal?.aborted) {
          reject(new DOMException('Search cancelled', 'AbortError'));
          return;
        }
        const row = cursor.result;
        if (!row || results.length >= limit) {
          resolve();
          return;
        }
        const record = row.value as Partial<Archived>;
        const message = validMessage(record.message);
        if (message && (!channels || channels.has(message.channel)) && matchesArchive(message, query))
          results.push(message);
        row.continue();
      };
    });
    await complete;
    return results;
  }
  stop(): void {
    this.stopped = true;
    clearOwnedInterval(this.timer);
    void this.flush()
      .then(async () => (await this.db).close())
      .catch(() => {});
  }
}
