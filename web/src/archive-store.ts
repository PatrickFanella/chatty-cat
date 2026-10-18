import { ArchiveReader } from './archive-reader';
import { MAX_ROWS, PUBLIC_ARCHIVE_COMMANDS, archiveKey, validMessage, type Archived } from './archive-records';
import type { ChatMessage } from './protocol';
import { parseRetention, type ArchiveRetention, type RetentionPlan } from './archive-retention';

export class ArchiveStore extends ArchiveReader {
  constructor(private policyWaitMs = 5000) {
    super();
  }
  async open(): Promise<void> {
    await this.db;
  }
  // Keep the write transaction active only while the owning Window handles one
  // small synchronous localStorage operation. Deletion stays inside IDB callbacks.
  private withPolicy(
    store: IDBObjectStore,
    load: () => Promise<ArchiveRetention>,
    use: (policy: ArchiveRetention) => void,
    abort: (error: unknown) => void,
  ): void {
    const deadline = Date.now() + this.policyWaitMs;
    let reply: { policy: ArchiveRetention } | { error: unknown } | undefined;
    void Promise.resolve()
      .then(load)
      .then(
        (policy) => {
          reply = { policy };
        },
        (error) => {
          reply = { error };
        },
      );
    const hold = () => {
      const request = store.getKey('');
      request.onsuccess = () => {
        if (reply) {
          if ('error' in reply) abort(reply.error);
          else {
            try {
              use(parseRetention(reply.policy));
            } catch (error) {
              abort(error);
            }
          }
        } else if (Date.now() >= deadline) {
          abort(new DOMException('Retention policy timed out; archive transaction aborted', 'TimeoutError'));
        } else hold();
      };
    };
    hold();
  }
  async prune(cap: number, policy: () => Promise<ArchiveRetention>): Promise<void> {
    const db = await this.db,
      tx = db.transaction('messages', 'readwrite'),
      store = tx.objectStore('messages');
    let failure: unknown;
    return new Promise((resolve, reject) => {
      const abort = (error: unknown) => {
        failure = error;
        tx.abort();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        failure ??= tx.error;
      };
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('Archive prune aborted'));
      const count = store.count();
      count.onsuccess = () =>
        this.withPolicy(
          store,
          policy,
          (selected) => {
            let remaining = count.result - Math.min(cap, selected.rows);
            const cutoff = selected.days ? Date.now() - selected.days * 86400000 : 0;
            if (remaining <= 0 && cutoff <= 0) return;
            const cursor = store.index('timestamp').openCursor();
            cursor.onsuccess = () => {
              const row = cursor.result;
              if (!row || (remaining <= 0 && Number(row.key) >= cutoff)) return;
              row.delete();
              remaining--;
              row.continue();
            };
          },
          abort,
        );
    });
  }
  async applyRetention(
    expected: RetentionPlan,
    capacity: number,
    policy: () => Promise<ArchiveRetention>,
  ): Promise<void> {
    const selected = parseRetention(expected.policy),
      at = expected.at;
    const db = await this.db,
      tx = db.transaction('messages', 'readwrite'),
      store = tx.objectStore('messages');
    const entries: { key: IDBValidKey; at: number }[] = [];
    let failure: unknown;
    return new Promise((resolve, reject) => {
      const abort = (error: unknown) => {
        failure = error;
        tx.abort();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        failure ??= tx.error;
      };
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('Retention could not be applied'));
      const cursor = store.index('timestamp').openKeyCursor();
      cursor.onsuccess = () => {
        const row = cursor.result;
        if (row) {
          if (typeof row.key === 'number') entries.push({ key: row.primaryKey, at: row.key });
          row.continue();
          return;
        }
        const cutoff = selected.days ? at - selected.days * 86400000 : 0;
        const remove = Math.max(
          entries.filter((e) => e.at < cutoff).length,
          Math.max(0, entries.length - Math.min(capacity, selected.rows)),
        );
        let hash = 2166136261;
        for (const e of entries)
          for (const code of String(e.key) + ':' + e.at + ';') hash = Math.imul(hash ^ code.charCodeAt(0), 16777619);
        if (
          expected.signature !== entries.length + ':' + (hash >>> 0) ||
          expected.remove !== remove ||
          expected.policy.rows !== selected.rows ||
          expected.policy.days !== selected.days
        ) {
          abort(new Error('Archive changed; preview retention again before applying'));
          return;
        }
        this.withPolicy(
          store,
          policy,
          (saved) => {
            if (saved.rows !== selected.rows || saved.days !== selected.days)
              throw new Error('Retention policy acknowledgement mismatch');
            for (const entry of entries.slice(0, remove)) store.delete(entry.key);
          },
          abort,
        );
      };
    });
  }
  async retentionPreview(policy: ArchiveRetention, at: number, capacity: number): Promise<RetentionPlan> {
    policy = parseRetention(policy);
    const db = await this.db;
    const tx = db.transaction('messages', 'readonly');
    const plan: RetentionPlan = { policy, at, rows: 0, remove: 0, oldest: null, newest: null, signature: '' };
    const cutoff = policy.days ? at - policy.days * 86400000 : 0;
    const cap = Math.min(capacity, policy.rows);
    let age = 0,
      hash = 2166136261;
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => {
        plan.remove = Math.max(age, Math.max(0, plan.rows - cap));
        plan.signature = plan.rows + ':' + (hash >>> 0);
        resolve(plan);
      };
      tx.onerror = () => {}; // Report only after the transaction has aborted.
      tx.onabort = () => reject(tx.error ?? new Error('Retention preview failed'));
      const cursor = tx.objectStore('messages').index('timestamp').openKeyCursor();
      cursor.onsuccess = () => {
        const row = cursor.result;
        if (!row) return;
        if (typeof row.key === 'number') {
          plan.rows++;
          plan.oldest ??= row.key;
          plan.newest = row.key;
          if (row.key < cutoff) age++;
          for (const code of String(row.primaryKey) + ':' + row.key + ';')
            hash = Math.imul(hash ^ code.charCodeAt(0), 16777619);
        }
        row.continue();
      };
    });
  }
  async append(messages: readonly ChatMessage[]): Promise<void> {
    if (messages.length > 2000 || messages.some((message) => !validMessage(message)))
      throw new Error('Archive batch must contain at most 2000 public messages');
    const db = await this.db;
    const tx = db.transaction('messages', 'readwrite');
    const complete = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error('Archive transaction aborted'));
      tx.onerror = () => {}; // Wait for rollback before acknowledging a failed write.
    });
    try {
      const store = tx.objectStore('messages');
      for (const message of messages) {
        const key = archiveKey(message);
        store.put({ key, channel: message.channel, timestamp: message.timestamp, message } satisfies Archived);
      }
    } catch (error) {
      tx.abort();
      await complete.catch(() => {});
      throw error;
    }
    await complete;
  }
  async recoverMissing(
    messages: readonly ChatMessage[],
    cap: number,
    policy: ArchiveRetention,
    signal?: AbortSignal,
  ): Promise<number> {
    if (messages.length > 6 || messages.some((m) => !PUBLIC_ARCHIVE_COMMANDS.includes(m.command) || !validMessage(m)))
      throw new Error('Recover at most six public excerpts');
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
        failure ??= tx.error ?? new Error('Recovery failed');
      };
      const count = store.count();
      count.onsuccess = () => {
        let available = Math.max(1, Math.min(MAX_ROWS, cap, policy.rows)) - count.result;
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
}
