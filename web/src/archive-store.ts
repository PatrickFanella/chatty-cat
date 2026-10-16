import { ArchiveReader } from './archive-reader';
import { MAX_ROWS, PUBLIC_ARCHIVE_COMMANDS, archiveKey, validMessage, type Archived } from './archive-records';
import type { ChatMessage } from './protocol';
import { parseRetention, type ArchiveRetention, type RetentionPlan } from './archive-retention';

export class ArchiveStore extends ArchiveReader {
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
