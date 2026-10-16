// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import '../test-support/storage-worker-shim';
import { afterEach, expect, it, vi } from 'vitest';
import { moveStatistics, previewStatisticsMove, readStatistics, writeStatistics } from './stats-storage';
const key = 'chatthing:v1:stats:counts:one',
  raw = JSON.stringify({
    version: 1,
    since: 0,
    seen: ['one:receipt'],
    rows: [[['one', 'users', 'alice'], 3, [[1, 3]], [[0, 3]]]],
  });
afterEach(async () => {
  vi.restoreAllMocks();
  localStorage.clear();
  await new Promise<void>((resolve, reject) => {
    const q = indexedDB.deleteDatabase('chatthing-statistics');
    q.onsuccess = () => resolve();
    q.onerror = () => reject(q.error);
  });
});
it('moves exact public count snapshots while preserving unrelated history, workspaces and journal keys', async () => {
  localStorage.setItem(key, raw);
  for (const name of ['chatthing:v1:history:one', 'chatthing:v1:profile:42:workspaces', 'private-journal'])
    localStorage.setItem(name, 'retain');
  const plan = previewStatisticsMove();
  expect(plan.entries).toEqual([{ key, raw }]);
  expect(await moveStatistics(plan)).toEqual({ moved: 1, changed: 0 });
  expect(localStorage.getItem(key)).toBeNull();
  expect(await readStatistics(key)).toBe(raw);
  expect(localStorage.length).toBe(3);
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const q = indexedDB.open('chatthing-statistics');
    q.onsuccess = () => resolve(q.result);
    q.onerror = () => reject(q.error);
  });
  const backups = await new Promise<unknown[]>((resolve, reject) => {
    const q = db.transaction('backups').objectStore('backups').getAll();
    q.onsuccess = () => resolve(q.result);
    q.onerror = () => reject(q.error);
  });
  db.close();
  expect(backups).toEqual([{ key, raw }]);
});
it('does not replace a newer IndexedDB snapshot or remove stale local originals', async () => {
  localStorage.setItem(key, raw);
  const plan = previewStatisticsMove();
  localStorage.setItem(key, raw + ' ');
  await expect(moveStatistics(plan)).rejects.toThrow('changed');
  expect(localStorage.getItem(key)).toBe(raw + ' ');
  await writeStatistics(key, raw + '\n');
  expect(await moveStatistics(previewStatisticsMove())).toEqual({ moved: 1, changed: 0 });
  expect(await readStatistics(key)).toBe(raw + '\n');
});
it('retains local originals when storage admission fails and rejects private/malformed scopes', async () => {
  localStorage.setItem(key, raw);
  const plan = previewStatisticsMove();
  vi.spyOn(indexedDB, 'open').mockImplementation(() => {
    throw new Error('quota');
  });
  await expect(moveStatistics(plan)).rejects.toThrow('quota');
  expect(localStorage.getItem(key)).toBe(raw);
  await expect(writeStatistics('private-journal', raw)).rejects.toThrow('scope');
});

it('retains every original when the copy transaction aborts before commit', async () => {
  localStorage.setItem(key, raw);
  const transaction = IDBDatabase.prototype.transaction;
  let abort = true;
  vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (
    this: IDBDatabase,
    stores,
    mode,
    options,
  ) {
    const tx = transaction.call(this, stores, mode, options);
    if (mode === 'readwrite' && abort) {
      abort = false;
      queueMicrotask(() => tx.abort());
    }
    return tx;
  });
  await expect(moveStatistics(previewStatisticsMove())).rejects.toThrow('aborted');
  expect(localStorage.getItem(key)).toBe(raw);
  expect(await readStatistics(key)).toBeUndefined();
});

it('retains local originals when committed recovery copies cannot be verified', async () => {
  localStorage.setItem(key, raw);
  const get = IDBObjectStore.prototype.get;
  const spy = vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function (this: IDBObjectStore, ...args) {
    const request = get.apply(this, args);
    if (this.name === 'backups')
      request.addEventListener('success', () => {
        Object.defineProperty(request, 'result', { value: undefined });
      });
    return request;
  });
  await expect(moveStatistics(previewStatisticsMove())).rejects.toThrow('backup verification failed');
  spy.mockRestore();
  expect(localStorage.getItem(key)).toBe(raw);
  expect(await readStatistics(key)).toBe(raw);
});
it('preserves a local original changed while the worker verifies its recovery copy', async () => {
  localStorage.setItem(key, raw);
  const get = IDBObjectStore.prototype.get;
  vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function (this: IDBObjectStore, ...args) {
    const request = get.apply(this, args);
    if (this.name === 'backups') request.addEventListener('success', () => localStorage.setItem(key, raw + ' '));
    return request;
  });
  expect(await moveStatistics(previewStatisticsMove())).toEqual({ moved: 0, changed: 1 });
  expect(localStorage.getItem(key)).toBe(raw + ' ');
  expect(await readStatistics(key)).toBe(raw);
});
it('captures reviewed entries before a caller mutates its plan during the worker request', async () => {
  localStorage.setItem(key, raw);
  const plan = previewStatisticsMove();
  const moving = moveStatistics(plan);
  plan.entries[0]!.raw = 'caller changed the plan';
  expect(await moving).toEqual({ moved: 1, changed: 0 });
  expect(await readStatistics(key)).toBe(raw);
});
it('keeps reviewed local originals when the worker cannot start', async () => {
  localStorage.setItem(key, raw);
  const native = Worker;
  vi.stubGlobal(
    'Worker',
    class {
      constructor() {
        throw new Error('Worker denied');
      }
    },
  );
  try {
    await expect(moveStatistics(previewStatisticsMove())).rejects.toThrow('Statistics worker unavailable');
    expect(localStorage.getItem(key)).toBe(raw);
  } finally {
    vi.stubGlobal('Worker', native);
  }
});
