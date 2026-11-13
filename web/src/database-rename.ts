// Moves each IndexedDB database saved by an older version to its current name, inside the storage
// worker, before the current database is first opened.

// Names used by older versions; kept only to move the data they saved. `batch` bounds the rows held
// in memory and the extra disk used at once: statistics and journal rows can be megabytes each.
const FORMER: Record<string, { name: string; batch: number }> = {
  'chatty-cat-archive': { name: 'chatthing-archive', batch: 500 },
  'chatty-cat-statistics': { name: 'chatthing-statistics', batch: 1 },
  'chatty-cat-moderation-journal': { name: 'chatthing-moderation-journal', batch: 1 },
  'chatty-cat-rates': { name: 'chatthing:v1:rates', batch: 1 },
};
const FORMER_KEY = 'chatthing:v1:';
const MOVE_FAILED =
  'Saved data is still under its old name; close older Chatty Cat tabs and reload to finish moving it.';
const NO_ROOM = 'Not enough storage space to move saved data to its new name; free some space and reload.';

let onProgress = (): void => {};
// The storage worker forwards progress so that clients waiting on a long move do not time out.
export function onDatabaseMove(listener: () => void): void {
  onProgress = listener;
}

const moves = new Map<string, Promise<void>>();
// Resolves with `open()` once any data under the former name has moved. A failed move is retried on
// the next call; until then the data stays in the old database.
export function openRenamed(name: string, open: () => Promise<IDBDatabase>): Promise<IDBDatabase> {
  let move = moves.get(name);
  if (!move) {
    move = moveDatabase(name, open);
    moves.set(name, move);
    move.catch(() => moves.delete(name));
  }
  return move.then(open);
}

async function moveDatabase(name: string, open: () => Promise<IDBDatabase>): Promise<void> {
  const former = FORMER[name];
  if (!former || typeof indexedDB === 'undefined') return;
  // Several storage workers run per tab, and tabs start together after a deploy. The lock lets one
  // move run at a time; without it every step is still safe to repeat.
  const locks = (globalThis.navigator as Navigator | undefined)?.locks;
  const waiting = setInterval(() => onProgress(), 5000);
  const run = () => {
    clearInterval(waiting);
    return move(former.name, former.batch, open);
  };
  try {
    await (locks ? locks.request('chatty-cat:v1:database-rename:' + name, run) : run());
  } finally {
    clearInterval(waiting);
  }
}

async function move(former: string, batch: number, open: () => Promise<IDBDatabase>): Promise<void> {
  // Errors before this point (no old database, or IndexedDB unavailable) keep their own message.
  const source = await fence(former);
  if (!source) return;
  try {
    const target = await open();
    try {
      for (const store of Array.from(source.objectStoreNames))
        while (await moveBatch(source, target, store, batch)) onProgress();
    } finally {
      target.close();
    }
  } catch (error) {
    const name = error instanceof Error || error instanceof DOMException ? error.name : '';
    const detail = name ? ` (${name}: ${(error as Error).message})` : '';
    throw new Error((name === 'QuotaExceededError' ? NO_ROOM : MOVE_FAILED) + detail, { cause: error });
  } finally {
    source.close();
  }
  await new Promise<void>((resolve) => {
    // The old database is empty now. A blocked delete stays queued until other connections close.
    const request = indexedDB.deleteDatabase(former);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
}

// Opens the old database at version 2 without changing its schema. Older versions open it at
// version 1, so their connections close and they can no longer write to it or re-create it.
async function fence(name: string): Promise<IDBDatabase | undefined> {
  const current = await opened(indexedDB.open(name));
  if (!current || current.version >= 2) return current;
  current.close();
  return opened(indexedDB.open(name, 2));
}

function opened(request: IDBOpenDBRequest): Promise<IDBDatabase | undefined> {
  return new Promise((resolve, reject) => {
    let blocked = false;
    // Opening a database that does not exist creates it: cancel that, there is nothing to move.
    request.onupgradeneeded = (event) => {
      if (event.oldVersion === 0) request.transaction?.abort();
    };
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) return db.close();
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = (event) => {
      event.preventDefault();
      if (request.error?.name === 'AbortError') resolve(undefined);
      else reject(request.error ?? new Error('Database unavailable'));
    };
    request.onblocked = () => {
      blocked = true;
      reject(new Error('Database blocked by an older tab'));
    };
  });
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function committed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
    tx.onerror = () => {};
  });
}

function renameKey(value: unknown): unknown {
  return typeof value === 'string' && value.startsWith(FORMER_KEY)
    ? 'chatty-cat:v1:' + value.slice(FORMER_KEY.length)
    : value;
}

// Copies one batch, then deletes it from the old database only after the copy has committed. The
// old database always holds exactly the rows not yet moved, so an interrupted move resumes.
async function moveBatch(source: IDBDatabase, target: IDBDatabase, name: string, batch: number): Promise<boolean> {
  const read = source.transaction(name, 'readonly').objectStore(name);
  const [keys, values] = await Promise.all([result(read.getAllKeys(null, batch)), result(read.getAll(null, batch))]);
  if (!keys.length) return false;
  const write = target.transaction(name, 'readwrite'),
    store = write.objectStore(name),
    copied = committed(write);
  keys.forEach((key, i) => {
    let value: unknown = values[i];
    // Statistics snapshots are keyed by storage key names, and each statistics backup names one.
    if (store.keyPath === null && value && typeof value === 'object' && 'key' in value)
      value = { ...value, key: renameKey(value.key) };
    const added = store.keyPath === null ? store.add(value, renameKey(key) as IDBValidKey) : store.add(value);
    // A row already in the current database wins: this version wrote it, or an interrupted batch did.
    added.onerror = (event) => {
      if (added.error?.name === 'ConstraintError') event.preventDefault();
    };
  });
  await copied;
  const remove = source.transaction(name, 'readwrite'),
    removed = committed(remove);
  for (const key of keys) remove.objectStore(name).delete(key);
  await removed;
  return true;
}
