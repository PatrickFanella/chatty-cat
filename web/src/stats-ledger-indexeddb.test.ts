// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { StorageWorkerShim } from '../test-support/storage-worker-shim';
import { afterEach, expect, it, vi } from 'vitest';
import { StatsLedger } from './stats-ledger';
import * as storage from './stats-storage';
import type { ChatMessage } from './protocol';
const key = 'chatthing:v1:stats:counts:one';
const message: ChatMessage = {
  id: 'one',
  command: 'PRIVMSG',
  channel: 'one',
  login: 'Alice',
  text: 'hello',
  timestamp: Date.now(),
  tags: {},
};
afterEach(async () => {
  vi.restoreAllMocks();
  localStorage.clear();
  await new Promise<void>((resolve, reject) => {
    const q = indexedDB.deleteDatabase('chatthing-statistics');
    q.onsuccess = () => resolve();
    q.onerror = () => reject(q.error);
  });
});
it('saves and reloads counts without using full localStorage or recounting replay', async () => {
  const first = new StatsLedger(['one'], () => ({}));
  await first.ready;
  first.bootstrap([]);
  first.observe(message);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota');
  });
  await first.save();
  expect(first.storageFailed).toBe(false);
  expect(localStorage.getItem(key)).toBeNull();
  const next = new StatsLedger(['one'], () => ({}));
  next.bootstrap([message]);
  next.observe(message);
  await next.ready;
  expect(next.ranks('users', 0)).toEqual([{ name: 'alice', count: 1 }]);
});
it('replays incoming observations only after the stored deduplication IDs are loaded', async () => {
  const saved = new StatsLedger(['one'], () => ({}));
  await saved.ready;
  saved.observe(message);
  const raw = JSON.stringify(saved.snapshot());
  let resolve!: (raw: string) => void;
  vi.spyOn(storage, 'readStatistics').mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const next = new StatsLedger(['one'], () => ({}));
  next.bootstrap([message]);
  next.observe(message);
  next.observe({ ...message, id: 'new' });
  resolve(raw);
  await next.ready;
  expect(next.ranks('users', 0)).toEqual([{ name: 'alice', count: 2 }]);
});
it('retains the legacy fallback and reports IndexedDB write refusal', async () => {
  const first = new StatsLedger(['one'], () => ({}));
  await first.ready;
  first.observe(message);
  const raw = JSON.stringify(first.snapshot());
  localStorage.setItem(key, raw);
  const next = new StatsLedger(['one'], () => ({}));
  await next.ready;
  vi.spyOn(storage, 'writeStatisticsSnapshot').mockRejectedValue(new Error('denied'));
  await next.save();
  expect(next.storageFailed).toBe(true);
  expect(localStorage.getItem(key)).toBe(raw);
  expect(next.ranks('users', 0)).toEqual([{ name: 'alice', count: 1 }]);
});

it('stores byte-equivalent JSON through worker serialization', async () => {
  const now = Date.now();
  vi.spyOn(Date, 'now').mockReturnValue(now);
  const ledger = new StatsLedger(['one'], () => ({}));
  await ledger.ready;
  ledger.observe({ ...message, text: 'Unicode 猫 🐈 \"quoted\"', tags: { badges: 'subscriber/12' } });
  const expected = JSON.stringify(ledger.snapshot());
  await ledger.save();
  expect(ledger.storageFailed).toBe(false);
  expect(await storage.readStatistics(key)).toBe(expected);
});
it('keeps queued snapshots at capture time when observations arrive during serialization', async () => {
  let release: (() => void) | undefined,
    held = false;
  class Delayed extends StorageWorkerShim {
    override postMessage(value: unknown): void {
      if (!held && (value as { operation?: string }).operation === 'statistics.snapshot') {
        held = true;
        const captured = structuredClone(value);
        release = () => super.postMessage(captured);
      } else super.postMessage(value);
    }
  }
  const native = Worker;
  vi.stubGlobal('Worker', Delayed);
  const ledger = new StatsLedger(['one'], () => ({}));
  await ledger.ready;
  ledger.observe(message);
  const first = ledger.save();
  try {
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    ledger.observe({ ...message, id: 'second' });
    const second = ledger.save();
    await Promise.resolve();
    ledger.observe({ ...message, id: 'third' });
    release?.();
    release = undefined;
    await Promise.all([first, second]);
    const restored = new StatsLedger(['one'], () => ({}));
    await restored.ready;
    expect(restored.ranks('users', 0)).toEqual([{ name: 'alice', count: 2 }]);
    await ledger.save();
    const latest = new StatsLedger(['one'], () => ({}));
    await latest.ready;
    expect(latest.ranks('users', 0)).toEqual([{ name: 'alice', count: 3 }]);
  } finally {
    release?.();
    await first;
    vi.stubGlobal('Worker', native);
  }
});
it('retains the previous snapshot when worker JSON exceeds capacity', async () => {
  const snapshot = { version: 1, since: 0, rows: [], seen: [] };
  await storage.writeStatisticsSnapshot(key, snapshot);
  await expect(storage.writeStatisticsSnapshot(key, { padding: 'x'.repeat(6000000) })).rejects.toThrow('capacity');
  expect(await storage.readStatistics(key)).toBe(JSON.stringify(snapshot));
  await expect(storage.writeStatisticsSnapshot('private-journal', snapshot)).rejects.toThrow('scope');
});
