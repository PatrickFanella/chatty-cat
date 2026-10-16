import type { RateSnapshot } from './rate-timeline';

export class RateStore {
  private db = new Promise<IDBDatabase>((resolve, reject) => {
    let abandoned = false;
    try {
      const request = indexedDB.open('chatthing:v1:rates', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('snapshots');
      request.onerror = () => reject(request.error ?? new Error('Rate storage unavailable'));
      request.onblocked = () => {
        abandoned = true;
        reject(new Error('Rate storage blocked; close older tabs and reload'));
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        if (abandoned) {
          db.close();
          return;
        }
        resolve(db);
      };
    } catch (error) {
      reject(error);
    }
  });
  constructor() {
    void this.db.catch(() => {});
  }
  async read(key: string): Promise<unknown> {
    const db = await this.db;
    const tx = db.transaction('snapshots', 'readonly');
    return new Promise((resolve, reject) => {
      let snapshot: unknown;
      const request = tx.objectStore('snapshots').get(key);
      request.onsuccess = () => {
        snapshot = request.result;
      };
      tx.oncomplete = () => resolve(snapshot);
      tx.onerror = () => {};
      tx.onabort = () => reject(tx.error ?? new Error('Rate read aborted'));
    });
  }
  async write(key: string, snapshot: RateSnapshot): Promise<void> {
    const db = await this.db;
    const tx = db.transaction('snapshots', 'readwrite');
    const complete = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => {};
      tx.onabort = () => reject(tx.error ?? new Error('Rate write aborted'));
    });
    try {
      const store = tx.objectStore('snapshots');
      store.put(snapshot, key);
      const keys = store.getAllKeys();
      keys.onsuccess = () => {
        const older = keys.result.filter((other) => other !== key);
        for (const other of older.slice(0, Math.max(0, older.length - 15))) store.delete(other);
      };
    } catch (error) {
      tx.abort();
      await complete.catch(() => {});
      throw error;
    }
    await complete;
  }
  async stop(): Promise<void> {
    try {
      (await this.db).close();
    } catch {
      /* Optional public aggregate storage. */
    }
  }
}
