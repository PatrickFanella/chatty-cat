import { ArchiveReader } from './archive-reader';
import { MAX_ROWS, PUBLIC_ARCHIVE_COMMANDS, archiveKey, validMessage, type Archived } from './archive-records';
import type { ChatMessage } from './protocol';
import type { ArchiveRetention } from './archive-retention';

export class ArchiveStore extends ArchiveReader {
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
