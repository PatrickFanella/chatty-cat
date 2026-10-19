// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import '../test-support/storage-worker-shim';
import { afterEach, expect, it, vi } from 'vitest';
import { RateSeries, RateTimeline } from './rate-timeline';
import { RateStore } from './rate-store';
import { StorageWorkerClient } from './storage-worker-client';
import type { ChatMessage } from './protocol';
const timelines: RateTimeline[] = [],
  workers: StorageWorkerClient[] = [];
const message: ChatMessage = {
  id: 'one',
  channel: 'one',
  login: 'fixture',
  command: 'PRIVMSG',
  text: 'glorp',
  timestamp: 100000,
  tags: {},
};
function timeline() {
  const value = new RateTimeline(document.createElement('span'), ['one']);
  timelines.push(value);
  return value;
}
function worker() {
  const value = new StorageWorkerClient();
  workers.push(value);
  return value;
}
function clock(now: number) {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(now);
}
afterEach(async () => {
  for (const value of timelines.splice(0)) await value.stop();
  for (const value of workers.splice(0)) await value.stop();
  vi.restoreAllMocks();
  vi.useRealTimers();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('chatthing:v1:rates');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
});
it('restores committed counts and source coverage, marks closed time and excludes replay', async () => {
  clock(100000);
  const first = timeline();
  await first.ready;
  first.series.coverage.setSources(['one']);
  first.series.status({ type: 'status', state: 'connected', detail: '' });
  first.series.observe(message, true);
  await vi.advanceTimersByTimeAsync(4000);
  await first.stop();
  vi.setSystemTime(110000);
  const restored = timeline();
  await restored.ready;
  expect((await restored.series.samples(110000, 11))[0]?.rate).toBe(0.2);
  expect((await restored.series.samples(110000, 11))[6]?.gap).toBe('page closed');
  expect(await restored.series.coverage.snapshot(110000)).toEqual([{ channel: 'one', from: 100, to: 104 }]);
  restored.series.observe(message, false);
  expect((await restored.series.snapshot()).rows.reduce((n, row) => n + row[2], 0)).toBe(1);
});
it('drains an in-flight periodic save and writes later observations before terminating', async () => {
  clock(100000);
  let release: (() => void) | undefined,
    held = false;
  const native = RateStore.prototype.write;
  vi.spyOn(RateStore.prototype, 'write').mockImplementation(async function (this: RateStore, key, snapshot) {
    if (!held) {
      held = true;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    }
    return native.call(this, key, snapshot);
  });
  const value = timeline();
  await value.ready;
  value.series.observe(message, true);
  await vi.advanceTimersByTimeAsync(30000);
  try {
    expect(release).toBeTypeOf('function');
    value.series.observe({ ...message, id: 'later' }, true);
    const stopped = value.stop();
    expect(value.stop()).toBe(stopped);
    release?.();
    release = undefined;
    await stopped;
    const saved = (await worker().request('rates.read', 'one')) as ReturnType<RateSeries['snapshot']>;
    expect(saved.rows.reduce((n, row) => n + row[2], 0)).toBe(2);
  } finally {
    release?.();
    await value.stop();
  }
});
it('stores counts, gaps and coverage atomically and retains at most sixteen scope keys', async () => {
  const storage = worker();
  const snapshot = {
    at: 104,
    from: 100,
    rows: [['one', 101, 2, 1] as [string, number, number, number]],
    gaps: [{ from: 102, to: 103, cause: 'socket dropped' as const }],
    coverage: [{ channel: 'one', from: 100, to: 102 }],
  };
  for (let i = 0; i < 18; i++) await storage.request('rates.write', 'scope' + String(i).padStart(2, '0'), snapshot);
  expect(await storage.request('rates.read', 'scope00')).toBeUndefined();
  expect(await storage.request('rates.read', 'scope01')).toBeUndefined();
  expect(await storage.request('rates.read', 'scope02')).toEqual(snapshot);
  expect(await storage.request('rates.read', 'scope17')).toEqual(snapshot);
});
it('keeps the previous snapshot after an aborted write and leaves storage usable', async () => {
  const storage = worker(),
    snapshot = new RateSeries(['one'], 100000).snapshot(100000);
  await storage.request('rates.write', 'one', snapshot);
  const transaction = IDBDatabase.prototype.transaction;
  const spy = vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (
    this: IDBDatabase,
    stores,
    mode,
    options,
  ) {
    const tx = transaction.call(this, stores, mode, options);
    if (mode === 'readwrite') queueMicrotask(() => tx.abort());
    return tx;
  });
  await expect(storage.request('rates.write', 'one', { ...snapshot, at: 200 })).rejects.toThrow('aborted');
  spy.mockRestore();
  expect(await storage.request('rates.read', 'one')).toEqual(snapshot);
});
it('reports unavailable computation without opening a main-thread database when the worker is denied', async () => {
  vi.stubGlobal(
    'Worker',
    class {
      constructor() {
        throw new Error('Worker denied');
      }
    },
  );
  const open = vi.spyOn(indexedDB, 'open');
  const value = timeline();
  await value.ready;
  value.series.observe({ ...message, timestamp: Date.now() }, true);
  await expect(value.series.snapshot()).rejects.toThrow('unavailable');
  await value.stop();
  expect(open).not.toHaveBeenCalled();
});

it('preserves retained history when shutdown arrives before startup restoration finishes', async () => {
  clock(110000);
  const storage = worker();
  const old = new RateSeries(['one'], 100000);
  old.observe(message, true, 100000);
  await storage.request('rates.write', 'one', old.snapshot(104000));
  const value = timeline();
  await value.stop();
  const snapshot = (await storage.request('rates.read', 'one')) as ReturnType<RateSeries['snapshot']>;
  expect(snapshot.rows.reduce((n, row) => n + row[2], 0)).toBe(1);
});
