const DATABASE = 'chatthing-statistics';
const MAX_CHARS = 6000000;
export interface StatisticsMove {
  entries: { key: string; raw: string }[];
  characters: number;
}
function validKey(key: string): boolean {
  return /^chatthing:v1:stats:counts:[a-z0-9_]{1,25}(?:,[a-z0-9_]{1,25}){0,11}$/.test(key);
}
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
export async function readStatistics(key: string): Promise<string | undefined> {
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
export async function writeStatistics(key: string, raw: string): Promise<void> {
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
export function previewStatisticsMove(): StatisticsMove {
  const entries: { key: string; raw: string }[] = [];
  let characters = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !validKey(key)) continue;
    const raw = localStorage.getItem(key);
    if (raw === null) continue;
    if (raw.length > MAX_CHARS || entries.length >= 64)
      throw new Error('Statistics scope exceeds the reviewed migration capacity');
    const value: unknown = JSON.parse(raw);
    if (
      !value ||
      typeof value !== 'object' ||
      (value as { version?: unknown }).version !== 1 ||
      !Object.keys(value).every((key) => ['version', 'since', 'limited', 'seen', 'pending', 'rows'].includes(key)) ||
      !Array.isArray((value as { rows?: unknown }).rows)
    )
      throw new Error('Unreadable statistics retained; export/review them before moving');
    entries.push({ key, raw });
    characters += key.length + raw.length;
    if (characters > MAX_CHARS) throw new Error('Statistics move exceeds the reviewed total capacity');
  }
  return { entries, characters };
}
export async function moveStatistics(plan: StatisticsMove): Promise<{ moved: number; changed: number }> {
  if (!plan.entries.length) throw new Error('No local statistics need moving');
  if (
    plan.entries.length > 64 ||
    plan.entries.reduce((total, e) => total + e.key.length + e.raw.length, 0) > MAX_CHARS ||
    new Set(plan.entries.map((e) => e.key)).size !== plan.entries.length ||
    plan.entries.some((e) => !validKey(e.key) || e.raw.length > MAX_CHARS)
  )
    throw new Error('Invalid statistics move');
  if (plan.entries.some((e) => localStorage.getItem(e.key) !== e.raw))
    throw new Error('Statistics changed; review the move again');
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
    let moved = 0,
      changed = 0;
    for (const entry of copies) {
      if (localStorage.getItem(entry.key) !== entry.raw) {
        changed++;
        continue;
      }
      localStorage.removeItem(entry.key);
      moved++;
    }
    return { moved, changed };
  } finally {
    db.close();
  }
}
