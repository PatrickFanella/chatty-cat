import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// Each test starts with empty IndexedDB and fresh modules, so no move is cached between tests.
beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function openDatabase(name: string, version: number, upgrade: (db: IDBDatabase) => void): Promise<IDBDatabase> {
  const req = indexedDB.open(name, version);
  req.onupgradeneeded = () => upgrade(req.result);
  return request(req);
}
async function put(db: IDBDatabase, store: string, rows: [IDBValidKey | undefined, unknown][]): Promise<void> {
  const tx = db.transaction(store, 'readwrite');
  for (const [key, value] of rows) tx.objectStore(store).put(value, key);
  await new Promise((resolve) => (tx.oncomplete = resolve));
}
async function all(name: string, store: string): Promise<{ keys: IDBValidKey[]; values: unknown[] }> {
  const db = await request(indexedDB.open(name));
  try {
    const s = db.transaction(store, 'readonly').objectStore(store);
    return { keys: await request(s.getAllKeys()), values: await request(s.getAll()) };
  } finally {
    db.close();
  }
}
async function names(): Promise<string[]> {
  return (await indexedDB.databases()).map((db) => db.name!).sort();
}

function archiveSchema(db: IDBDatabase): void {
  const store = db.createObjectStore('messages', { keyPath: 'key' });
  store.createIndex('timestamp', 'timestamp');
  store.createIndex('channel-time', ['channel', 'timestamp']);
}
const rows = Array.from({ length: 1200 }, (_, i) => {
  const id = String(i).padStart(5, '0');
  return {
    key: 'one:' + id,
    channel: 'one',
    timestamp: i,
    message: { id, command: 'PRIVMSG', channel: 'one', login: 'a', text: 'hi ' + i, timestamp: i, tags: {} },
  };
});
async function seedArchive(count = rows.length): Promise<void> {
  const db = await openDatabase('chatthing-archive', 1, archiveSchema);
  await put(
    db,
    'messages',
    rows.slice(0, count).map((row) => [undefined, row]),
  );
  db.close();
}

it('moves the archive in batches, keeps every row and deletes the old database', async () => {
  await seedArchive();
  const { onDatabaseMove } = await import('./database-rename');
  const { ArchiveStore } = await import('./archive-store');
  const progress = vi.fn();
  onDatabaseMove(progress);
  const store = new ArchiveStore();
  await store.open();
  expect(progress).toHaveBeenCalledTimes(3); // 500 + 500 + 200 rows
  expect((await all('chatty-cat-archive', 'messages')).values).toEqual(rows);
  expect(await names()).toEqual(['chatty-cat-archive']);
  expect((await store.recent(['one'], 2)).map((m) => m.id)).toEqual(['01198', '01199']);
  await store.stop();
});

it('keeps unmoved rows in the old database after a failed batch, then resumes', async () => {
  await seedArchive();
  vi.stubGlobal('navigator', {}); // No Web Locks: every step must still be safe to repeat.
  const { openRenamed } = await import('./database-rename');
  const open = () => request(indexedDB.open('chatty-cat-archive', 1));
  // The current database already exists, as the archive store would create it.
  (await openDatabase('chatty-cat-archive', 1, archiveSchema)).close();
  let writes = 0;
  const failing = async () => {
    const db = await open();
    const transaction = db.transaction.bind(db);
    db.transaction = ((store: string, mode?: IDBTransactionMode) => {
      if (mode === 'readwrite' && ++writes === 2) throw new DOMException('Disk full', 'QuotaExceededError');
      return transaction(store, mode);
    }) as IDBDatabase['transaction'];
    return db;
  };
  await expect(openRenamed('chatty-cat-archive', failing)).rejects.toThrow(
    /Not enough storage space.*QuotaExceededError/,
  );
  const old = await all('chatthing-archive', 'messages'),
    current = await all('chatty-cat-archive', 'messages');
  expect(old.values).toEqual(rows.slice(500));
  expect(current.values).toEqual(rows.slice(0, 500));
  // The old database is fenced: an older version can no longer open it.
  await expect(request(indexedDB.open('chatthing-archive', 1))).rejects.toMatchObject({ name: 'VersionError' });

  (await openRenamed('chatty-cat-archive', open)).close();
  expect((await all('chatty-cat-archive', 'messages')).values).toEqual(rows);
  expect(await names()).toEqual(['chatty-cat-archive']);
});

it('finishes a batch that was copied but not yet deleted before an interruption', async () => {
  await seedArchive();
  const current = await openDatabase('chatty-cat-archive', 1, archiveSchema);
  await put(
    current,
    'messages',
    rows.slice(0, 500).map((row) => [undefined, row]),
  );
  current.close();
  const { openRenamed } = await import('./database-rename');
  (await openRenamed('chatty-cat-archive', () => request(indexedDB.open('chatty-cat-archive', 1)))).close();
  expect((await all('chatty-cat-archive', 'messages')).values).toEqual(rows);
  expect(await names()).toEqual(['chatty-cat-archive']);
});

it('opens without creating an old database when there is nothing to move', async () => {
  const { openRenamed } = await import('./database-rename');
  (await openRenamed('chatty-cat-archive', () => openDatabase('chatty-cat-archive', 1, archiveSchema))).close();
  expect(await names()).toEqual(['chatty-cat-archive']);
});

it('renames statistics snapshot keys and backup keys, and keeps a newer current snapshot', async () => {
  const old = await openDatabase('chatthing-statistics', 1, (db) => {
    db.createObjectStore('snapshots');
    db.createObjectStore('backups');
  });
  await put(old, 'snapshots', [
    ['chatthing:v1:stats:counts:one', '{"saved":"old"}'],
    ['chatthing:v1:stats:counts:two', '{"saved":"older"}'],
  ]);
  await put(old, 'backups', [['backup-1', { key: 'chatthing:v1:stats:counts:one', raw: '{"saved":"old"}' }]]);
  old.close();
  const current = await openDatabase('chatty-cat-statistics', 1, (db) => {
    db.createObjectStore('snapshots');
    db.createObjectStore('backups');
  });
  await put(current, 'snapshots', [['chatty-cat:v1:stats:counts:two', '{"saved":"current"}']]);
  current.close();

  const store = await import('./statistics-store');
  expect(await store.readStatisticsRecord('chatty-cat:v1:stats:counts:one')).toBe('{"saved":"old"}');
  expect(await store.readStatisticsRecord('chatty-cat:v1:stats:counts:two')).toBe('{"saved":"current"}');
  expect(await all('chatty-cat-statistics', 'backups')).toEqual({
    keys: ['backup-1'],
    values: [{ key: 'chatty-cat:v1:stats:counts:one', raw: '{"saved":"old"}' }],
  });
  expect(await names()).toEqual(['chatty-cat-statistics']);
});

it('tells every pending storage worker request that a move is still running', async () => {
  await seedArchive(600);
  const { StorageWorkerHost } = await import('./storage-worker-host');
  const host = new StorageWorkerHost(),
    notices: unknown[] = [];
  const reply = await host.handle({ version: 1, id: 7, operation: 'archive.open', args: [] }, (notice) =>
    notices.push(notice),
  );
  expect(reply).toEqual({ version: 1, id: 7, ok: true, result: undefined });
  expect(notices).toEqual([
    { version: 1, id: 7, moving: true },
    { version: 1, id: 7, moving: true },
  ]);
  await host.stop();
});
