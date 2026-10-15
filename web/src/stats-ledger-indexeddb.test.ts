// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
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
  vi.spyOn(storage, 'writeStatistics').mockRejectedValue(new Error('denied'));
  await next.save();
  expect(next.storageFailed).toBe(true);
  expect(localStorage.getItem(key)).toBe(raw);
  expect(next.ranks('users', 0)).toEqual([{ name: 'alice', count: 1 }]);
});
