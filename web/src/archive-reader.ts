import type { ChatMessage } from './protocol';
import {
  MAX_ROWS,
  validMessage,
  compileArchiveFilter,
  type Archived,
  type ArchiveQuery,
  type ArchiveCursor,
  type ArchivePage,
  type ArchiveScanPage,
} from './archive-records';
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
export class ArchiveReader {
  protected db = new Promise<IDBDatabase>((resolve, reject) => {
    let blocked = false;
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Archive unavailable'));
      return;
    }
    const open = indexedDB.open('chatthing-archive', 1);
    open.onupgradeneeded = () => {
      const store = open.result.createObjectStore('messages', { keyPath: 'key' });
      store.createIndex('timestamp', 'timestamp');
      store.createIndex('channel-time', ['channel', 'timestamp']);
    };
    open.onsuccess = () => {
      if (blocked) {
        open.result.close();
        return;
      }
      open.result.onversionchange = () => open.result.close();
      resolve(open.result);
    };
    open.onerror = () => reject(open.error ?? new Error('Archive unavailable'));
    open.onblocked = () => {
      blocked = true;
      reject(new Error('Archive blocked; close older tabs and reload'));
    };
  });
  constructor() {
    void this.db.catch(() => {});
  }
  async get(id: string, channels: readonly string[]): Promise<ChatMessage | undefined> {
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
  async searchPage(
    query: ArchiveQuery,
    after?: ArchiveCursor,
    signal?: AbortSignal,
    progress: (scanned: number) => void = () => {},
  ): Promise<ArchivePage> {
    if (signal?.aborted) throw new DOMException('Search cancelled', 'AbortError');
    const matches = compileArchiveFilter(query);
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
        reject(signal?.aborted ? cancelled() : (tx.error ?? new Error('Archive scan failed')));
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
        if (message && matches(message)) {
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
    if (signal?.aborted) throw new DOMException('Search cancelled', 'AbortError');
    const matches = compileArchiveFilter(query);
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
        if (message && (!channels || channels.has(message.channel)) && matches(message)) results.push(message);
        row.continue();
      };
    });
    await complete;
    return results;
  }
  async scanPage(
    channel: string,
    after?: ArchiveCursor,
    until?: ArchiveCursor,
    signal?: AbortSignal,
  ): Promise<ArchiveScanPage> {
    if (signal?.aborted) throw new DOMException('Search cancelled', 'AbortError');
    const db = await this.db;
    const tx = db.transaction('messages', 'readonly');
    const messages: ChatMessage[] = [];
    let next: ArchiveCursor | undefined,
      last: ArchiveCursor | undefined,
      end = until;
    return new Promise((resolve, reject) => {
      const abort = () => {
        try {
          tx.abort();
        } catch {
          /* already finished */
        }
      };
      const clean = () => signal?.removeEventListener('abort', abort);
      signal?.addEventListener('abort', abort, { once: true });
      tx.oncomplete = () => {
        clean();
        signal?.aborted
          ? reject(new DOMException('Search cancelled', 'AbortError'))
          : resolve({ messages, next, until: end });
      };
      tx.onabort = () => {
        clean();
        reject(
          signal?.aborted
            ? new DOMException('Search cancelled', 'AbortError')
            : (tx.error ?? new Error('Archive scan aborted')),
        );
      };
      tx.onerror = () => {};
      const index = tx.objectStore('messages').index('channel-time');
      const scan = () => {
        const cursor = index.openCursor(
          IDBKeyRange.bound([channel, after?.timestamp ?? 0], [channel, end?.timestamp ?? 8640000000000000]),
        );
        cursor.onsuccess = () => {
          if (signal?.aborted) {
            abort();
            return;
          }
          const row = cursor.result;
          if (!row) return;
          const timestamp = Array.isArray(row.key) ? Number(row.key[1]) : NaN;
          if (!Number.isFinite(timestamp) || typeof row.primaryKey !== 'string') {
            row.continue();
            return;
          }
          if (end && timestamp === end.timestamp && row.primaryKey > end.key) return;
          if (after && timestamp === after.timestamp && row.primaryKey <= after.key) {
            row.continue();
            return;
          }
          if (messages.length >= 100) {
            next = last;
            return;
          }
          last = { timestamp, key: row.primaryKey };
          const record = row.value as Partial<Archived>;
          const message = validMessage(record.message);
          if (message && message.channel === channel) messages.push(message);
          row.continue();
        };
      };
      if (end) scan();
      else {
        const latest = index.openKeyCursor(IDBKeyRange.bound([channel, 0], [channel, 8640000000000000]), 'prev');
        latest.onsuccess = () => {
          const row = latest.result;
          if (!row || !Array.isArray(row.key) || typeof row.primaryKey !== 'string') return;
          end = { timestamp: Number(row.key[1]), key: row.primaryKey };
          scan();
        };
      }
    });
  }
  async stop(): Promise<void> {
    try {
      (await this.db).close();
    } catch {
      /* unavailable */
    }
  }
}
