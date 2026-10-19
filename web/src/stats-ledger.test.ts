// @vitest-environment happy-dom
import '../test-support/storage-worker-shim';
import { beforeEach, expect, it, vi } from 'vitest';
import { StatsLedger } from './stats-ledger';
import type { ChatMessage } from './protocol';
const catalog = {
  Kappa: {
    code: 'Kappa',
    source: 'BTTV',
    url: 'https://example.com/k.png',
    staticUrl: '',
    animated: false,
    zeroWidth: false,
  },
};
const message: ChatMessage = {
  id: '1',
  command: 'PRIVMSG',
  channel: 'one',
  login: 'Alice',
  text: 'Kappa Kappa https://example.com/Case https://www.example.com/Case',
  timestamp: 3600000,
  tags: { badges: 'subscriber/12,subscriber/12' },
};
beforeEach(() => localStorage.clear());
it('retains deduplicated totals, exact badge versions, case-sensitive URLs and independent hour windows', async () => {
  const ledger = new StatsLedger(['one', 'two'], () => catalog);
  ledger.observe(message, 3600000);
  ledger.observe(message, 3600000);
  ledger.observe({ ...message, id: '2', channel: 'two', login: 'bob' }, 7200000);
  expect(await ledger.ranks('users', 0, 'one')).toEqual([{ name: 'alice', count: 1 }]);
  expect(await ledger.ranks('emotes', 0)).toEqual([{ name: 'Kappa', count: 4 }]);
  expect(await ledger.ranks('badges', 0, 'one')).toEqual([{ name: 'subscriber/12', count: 1 }]);
  expect(await ledger.ranks('links', 0, 'one')).toEqual([{ name: 'https://example.com/Case', count: 1 }]);
  expect(await ledger.ranks('users', 1, '', new Set(), 7200000)).toEqual([{ name: 'bob', count: 1 }]);
  expect(await ledger.ranks('users', 0, '', new Set(['alice']))).toEqual([{ name: 'bob', count: 1 }]);
  ledger.observe({ ...message, id: 'notice', command: 'NOTICE' }, 7200000);
  ledger.observe({ ...message, id: 'unknown', channel: 'other' }, 7200000);
  expect(await ledger.ranks('users', 0)).toHaveLength(2);
});
it('restores recorded totals without counting hydrated rows again and retains totals after bucket pruning', async () => {
  const first = new StatsLedger(['one'], () => catalog);
  first.bootstrap([message]);
  await first.save();
  const next = new StatsLedger(['one'], () => catalog);
  next.bootstrap([message]);
  expect(await next.ranks('users', 0)).toEqual([{ name: 'alice', count: 1 }]);
  next.observe({ ...message, id: 'new' }, Date.now());
  expect(await next.ranks('users', 0)).toEqual([{ name: 'alice', count: 2 }]);
  next.prune(Date.now() + 40 * 86400000);
  expect(await next.ranks('users', 0)).toEqual([{ name: 'alice', count: 2 }]);
  expect(await next.ranks('users', 24, '', new Set(), Date.now() + 40 * 86400000)).toEqual([]);
});
it('reconciles third-party emotes once when metadata arrives without repeating native counts', async () => {
  let ready = false;
  const ledger = new StatsLedger(['one'], () => (ready ? catalog : {}));
  ledger.observe(message, 3600000);
  expect(await ledger.ranks('emotes', 0)).toEqual([]);
  ready = true;
  ledger.reconcile('one');
  ledger.reconcile('one');
  expect(await ledger.ranks('emotes', 0)).toEqual([{ name: 'Kappa', count: 2 }]);
  expect(await ledger.ranks('users', 0)).toEqual([{ name: 'alice', count: 1 }]);
});
it('rejects malformed snapshots atomically and reports unavailable storage', async () => {
  const ledger = new StatsLedger(['one'], () => catalog);
  ledger.observe(message, 3600000);
  const before = await ledger.ranks('users', 0);
  for (const rows of [
    [[['one', 'users', 'evil'], 1, [[1, -1]], []]],
    [[['other', 'users', 'evil'], 1, [], []]],
    [[['one', 'links', 'javascript:evil'], 1, [], []]],
  ])
    ledger.restore({ version: 1, since: 0, rows });
  expect(await ledger.ranks('users', 0)).toEqual(before);
  vi.stubGlobal('localStorage', {
    setItem: () => {
      throw new Error('quota');
    },
  });
  await ledger.save();
  expect(ledger.storageFailed).toBe(true);
  vi.unstubAllGlobals();
  await ledger.save();
  expect(ledger.storageFailed).toBe(false);
});

it('does not count reconnect backfill twice after reload even when the row was evicted', async () => {
  const first = new StatsLedger(['one'], () => catalog);
  first.observe(message);
  await first.save();
  const next = new StatsLedger(['one'], () => catalog);
  next.bootstrap([]);
  next.observe(message);
  expect(await next.ranks('users', 0)).toEqual([{ name: 'alice', count: 1 }]);
  next.observe({ ...message, id: 'new' });
  expect(await next.ranks('users', 0)).toEqual([{ name: 'alice', count: 2 }]);
});

it('preserves unfinished emote classification across reload until its retained message and catalog return', async () => {
  const first = new StatsLedger(['one'], () => ({}));
  first.observe(message);
  await first.save();
  const next = new StatsLedger(['one'], () => catalog);
  next.bootstrap([message]);
  next.reconcile('one');
  next.reconcile('one');
  expect(await next.ranks('emotes', 0)).toEqual([{ name: 'Kappa', count: 2 }]);
  expect(await next.ranks('users', 0)).toEqual([{ name: 'alice', count: 1 }]);
});

it('keeps hour/day message buckets across eviction and reload with scope and exclusions', async () => {
  const now = Math.floor(Date.now() / 86400000) * 86400000;
  const first = new StatsLedger(['one', 'two'], () => catalog);
  first.observe({ ...message, id: 'one' }, now - 3600000);
  first.observe({ ...message, id: 'two', channel: 'two', login: 'bob' }, now);
  await first.save();
  const next = new StatsLedger(['one', 'two'], () => catalog);
  next.bootstrap([]);
  expect(await next.buckets('hours', 'one', new Set(), now)).toEqual([{ at: now - 3600000, count: 1 }]);
  expect(await next.buckets('days', '', new Set(['alice']), now)).toEqual([{ at: now, count: 1 }]);
  expect(await next.buckets('hours', '', new Set(), now + 8 * 86400000)).toEqual([]);
  expect(await next.ranks('badges', 0, '', new Set(), now, 0)).toEqual([]);
});
it('counts newly imported rows once at their historical time after bootstrap', async () => {
  const ledger = new StatsLedger(['one'], () => catalog);
  ledger.bootstrap([]);
  ledger.observe(message, message.timestamp);
  ledger.observe(message, message.timestamp);
  expect(await ledger.buckets('hours', 'one', new Set(), message.timestamp)).toEqual([
    { at: message.timestamp, count: 1 },
  ]);
});

it('returns detached pending classification arrays for an asynchronous snapshot', async () => {
  const ledger = new StatsLedger(['one'], () => ({}));
  ledger.observe(message);
  const snapshot = (await ledger.snapshot()) as { pending: [string, number, string[]][] };
  snapshot.pending[0]![2].push('mutated snapshot');
  const fresh = (await ledger.snapshot()) as { pending: [string, number, string[]][] };
  expect(fresh.pending[0]![2]).toEqual([]);
});

it('admits a full 100000-row bootstrap plus catalog metadata without truncation', async () => {
  const ledger = new StatsLedger(['one'], () => catalog);
  ledger.bootstrap(Array(100000).fill(message));
  expect(await ledger.ranks('users', 0)).toEqual([{ name: 'alice', count: 1 }]);
  expect(ledger.storageRestoreUnavailable).toBe(false);
  await ledger.stop();
});
