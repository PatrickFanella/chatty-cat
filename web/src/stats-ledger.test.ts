// @vitest-environment happy-dom
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
it('retains deduplicated totals, exact badge versions, case-sensitive URLs and independent hour windows', () => {
  const ledger = new StatsLedger(['one', 'two'], () => catalog);
  ledger.observe(message, 3600000);
  ledger.observe(message, 3600000);
  ledger.observe({ ...message, id: '2', channel: 'two', login: 'bob' }, 7200000);
  expect(ledger.ranks('users', 0, 'one')).toEqual([{ name: 'alice', count: 1 }]);
  expect(ledger.ranks('emotes', 0)).toEqual([{ name: 'Kappa', count: 4 }]);
  expect(ledger.ranks('badges', 0, 'one')).toEqual([{ name: 'subscriber/12', count: 1 }]);
  expect(ledger.ranks('links', 0, 'one')).toEqual([{ name: 'https://example.com/Case', count: 1 }]);
  expect(ledger.ranks('users', 1, '', new Set(), 7200000)).toEqual([{ name: 'bob', count: 1 }]);
  expect(ledger.ranks('users', 0, '', new Set(['alice']))).toEqual([{ name: 'bob', count: 1 }]);
  ledger.observe({ ...message, id: 'notice', command: 'NOTICE' }, 7200000);
  ledger.observe({ ...message, id: 'unknown', channel: 'other' }, 7200000);
  expect(ledger.ranks('users', 0)).toHaveLength(2);
});
it('restores recorded totals without counting hydrated rows again and retains totals after bucket pruning', () => {
  const first = new StatsLedger(['one'], () => catalog);
  first.bootstrap([message]);
  first.save();
  const next = new StatsLedger(['one'], () => catalog);
  next.bootstrap([message]);
  expect(next.ranks('users', 0)).toEqual([{ name: 'alice', count: 1 }]);
  next.observe({ ...message, id: 'new' }, Date.now());
  expect(next.ranks('users', 0)).toEqual([{ name: 'alice', count: 2 }]);
  next.prune(Date.now() + 40 * 86400000);
  expect(next.ranks('users', 0)).toEqual([{ name: 'alice', count: 2 }]);
  expect(next.ranks('users', 24, '', new Set(), Date.now() + 40 * 86400000)).toEqual([]);
});
it('reconciles third-party emotes once when metadata arrives without repeating native counts', () => {
  let ready = false;
  const ledger = new StatsLedger(['one'], () => (ready ? catalog : {}));
  ledger.observe(message, 3600000);
  expect(ledger.ranks('emotes', 0)).toEqual([]);
  ready = true;
  ledger.reconcile('one');
  ledger.reconcile('one');
  expect(ledger.ranks('emotes', 0)).toEqual([{ name: 'Kappa', count: 2 }]);
  expect(ledger.ranks('users', 0)).toEqual([{ name: 'alice', count: 1 }]);
});
it('rejects malformed snapshots atomically and reports unavailable storage', () => {
  const ledger = new StatsLedger(['one'], () => catalog);
  ledger.observe(message, 3600000);
  const before = ledger.ranks('users', 0);
  for (const rows of [
    [[['one', 'users', 'evil'], 1, [[1, -1]], []]],
    [[['other', 'users', 'evil'], 1, [], []]],
    [[['one', 'links', 'javascript:evil'], 1, [], []]],
  ])
    ledger.restore({ version: 1, since: 0, rows });
  expect(ledger.ranks('users', 0)).toEqual(before);
  vi.stubGlobal('localStorage', {
    setItem: () => {
      throw new Error('quota');
    },
  });
  ledger.save();
  expect(ledger.storageFailed).toBe(true);
  vi.unstubAllGlobals();
  ledger.save();
  expect(ledger.storageFailed).toBe(false);
});

it('does not count reconnect backfill twice after reload even when the row was evicted', () => {
  const first = new StatsLedger(['one'], () => catalog);
  first.observe(message);
  first.save();
  const next = new StatsLedger(['one'], () => catalog);
  next.bootstrap([]);
  next.observe(message);
  expect(next.ranks('users', 0)).toEqual([{ name: 'alice', count: 1 }]);
  next.observe({ ...message, id: 'new' });
  expect(next.ranks('users', 0)).toEqual([{ name: 'alice', count: 2 }]);
});

it('preserves unfinished emote classification across reload until its retained message and catalog return', () => {
  const first = new StatsLedger(['one'], () => ({}));
  first.observe(message);
  first.save();
  const next = new StatsLedger(['one'], () => catalog);
  next.bootstrap([message]);
  next.reconcile('one');
  next.reconcile('one');
  expect(next.ranks('emotes', 0)).toEqual([{ name: 'Kappa', count: 2 }]);
  expect(next.ranks('users', 0)).toEqual([{ name: 'alice', count: 1 }]);
});

it('keeps hour/day message buckets across eviction and reload with scope and exclusions', () => {
  const now = Math.floor(Date.now() / 86400000) * 86400000;
  const first = new StatsLedger(['one', 'two'], () => catalog);
  first.observe({ ...message, id: 'one' }, now - 3600000);
  first.observe({ ...message, id: 'two', channel: 'two', login: 'bob' }, now);
  first.save();
  const next = new StatsLedger(['one', 'two'], () => catalog);
  next.bootstrap([]);
  expect(next.buckets('hours', 'one', new Set(), now)).toEqual([{ at: now - 3600000, count: 1 }]);
  expect(next.buckets('days', '', new Set(['alice']), now)).toEqual([{ at: now, count: 1 }]);
  expect(next.buckets('hours', '', new Set(), now + 8 * 86400000)).toEqual([]);
  expect(next.ranks('badges', 0, '', new Set(), now, 0)).toEqual([]);
});
it('counts newly imported rows once at their historical time after bootstrap', () => {
  const ledger = new StatsLedger(['one'], () => catalog);
  ledger.bootstrap([]);
  ledger.observe(message, message.timestamp);
  ledger.observe(message, message.timestamp);
  expect(ledger.buckets('hours', 'one', new Set(), message.timestamp)).toEqual([{ at: message.timestamp, count: 1 }]);
});

it('returns detached pending classification arrays for an asynchronous snapshot', () => {
  const ledger = new StatsLedger(['one'], () => ({}));
  ledger.observe(message);
  const snapshot = ledger.snapshot() as { pending: [string, number, string[]][] };
  snapshot.pending[0]![2].push('mutated snapshot');
  const fresh = ledger.snapshot() as { pending: [string, number, string[]][] };
  expect(fresh.pending[0]![2]).toEqual([]);
});
