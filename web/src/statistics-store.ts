import { MAX_CHARS, validKey, validateStatisticsMove, type StatisticsMove } from './statistics-records';
const DATABASE = 'chatthing-statistics';
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let blocked = false;
    const q = indexedDB.open(DATABASE, 1);
    q.onupgradeneeded = () => {
      q.result.createObjectStore('snapshots');
      q.result.createObjectStore('backups');
    };
    q.onsuccess = () => {
      if (blocked) {
        q.result.close();
        return;
      }
      q.result.onversionchange = () => q.result.close();
      resolve(q.result);
    };
    q.onerror = () => reject(q.error ?? new Error('Statistics storage unavailable'));
    q.onblocked = () => {
      blocked = true;
      reject(new Error('Close older statistics tabs and retry'));
    };
  });
}
function complete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('Statistics storage transaction aborted'));
    tx.onerror = () => {};
  });
}
export async function readStatisticsRecord(key: string): Promise<string | undefined> {
  if (!validKey(key)) throw new Error('Invalid statistics scope');
  const db = await database();
  try {
    const tx = db.transaction('snapshots', 'readonly'),
      done = complete(tx),
      q = tx.objectStore('snapshots').get(key);
    let raw: unknown;
    q.onsuccess = () => {
      raw = q.result;
    };
    await done;
    if (raw !== undefined && (typeof raw !== 'string' || raw.length > MAX_CHARS))
      throw new Error('Invalid saved statistics');
    return raw as string | undefined;
  } finally {
    db.close();
  }
}
export async function writeStatisticsRecord(key: string, raw: string): Promise<void> {
  if (!validKey(key)) throw new Error('Invalid statistics scope');
  if (raw.length > MAX_CHARS) throw new Error('Statistics capacity reached');
  const db = await database();
  try {
    const tx = db.transaction('snapshots', 'readwrite'),
      done = complete(tx);
    tx.objectStore('snapshots').put(raw, key);
    await done;
  } finally {
    db.close();
  }
}
export async function writeStatisticsSnapshot(key: string, snapshot: unknown): Promise<void> {
  if (!validKey(key)) throw new Error('Invalid statistics scope');
  const raw = JSON.stringify(snapshot);
  if (typeof raw !== 'string') throw new Error('Invalid statistics snapshot');
  await writeStatisticsRecord(key, raw);
}
export async function copyStatisticsRecords(plan: StatisticsMove): Promise<void> {
  validateStatisticsMove(plan);
  const db = await database(),
    copies = plan.entries.map((entry) => ({ ...entry, id: crypto.randomUUID() }));
  try {
    const tx = db.transaction(['snapshots', 'backups'], 'readwrite'),
      done = complete(tx);
    for (const entry of copies) {
      tx.objectStore('backups').add({ key: entry.key, raw: entry.raw }, entry.id);
      const q = tx.objectStore('snapshots').get(entry.key);
      q.onsuccess = () => {
        if (q.result === undefined) tx.objectStore('snapshots').put(entry.raw, entry.key);
      };
    }
    await done;
    // Read exact recovery copies in a separate committed transaction before releasing slots.
    const verify = db.transaction('backups', 'readonly'),
      verified = complete(verify);
    let mismatch = false;
    for (const entry of copies) {
      const q = verify.objectStore('backups').get(entry.id);
      q.onsuccess = () => {
        if (q.result?.key !== entry.key || q.result?.raw !== entry.raw) mismatch = true;
      };
    }
    await verified;
    if (mismatch) throw new Error('Statistics backup verification failed; local originals retained');
  } finally {
    db.close();
  }
}
