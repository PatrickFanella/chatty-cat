// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import '../test-support/storage-worker-shim';
import { forceCloseDatabase } from 'fake-indexeddb';
import { afterEach, expect, it, vi } from 'vitest';
import { ModerationJournal, journalExport, type JournalEntry } from './moderation-journal';
const journals: ModerationJournal[] = [];
afterEach(async () => {
  for (const journal of journals.splice(0)) await journal.stop();
  vi.restoreAllMocks();
  await new Promise<void>((resolve, reject) => {
    const q = indexedDB.deleteDatabase('chatthing-moderation-journal');
    q.onsuccess = () => resolve();
    q.onerror = () => reject(q.error);
  });
});
function journal() {
  const value = new ModerationJournal();
  journals.push(value);
  return value;
}
const receipt: JournalEntry = {
  id: 'request-1234567890',
  at: Date.now(),
  channel: 'one',
  target: 'alice',
  command: '/timeout alice 3 private reason',
  outcome: 'pending',
  detail: '',
};
it('fails closed after an unexpected database close instead of treating storage as a fresh journal', async () => {
  let connection: IDBDatabase | undefined;
  const open = indexedDB.open.bind(indexedDB);
  vi.spyOn(indexedDB, 'open').mockImplementation((...args) => {
    const q = open(...args);
    q.addEventListener('success', () => {
      connection = q.result;
    });
    return q;
  });
  const store = journal();
  await store.begin('42', receipt);
  await store.finish('42', receipt.id, 'confirmed', 'Provider confirmed');
  // fake-indexeddb's declaration uses a constructor type; its runtime expects an instance.
  // @ts-expect-error Installed fake-indexeddb declaration mismatch.
  forceCloseDatabase(connection!);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await expect(store.list('42')).rejects.toThrow(/storage closed.*reload/i);
  await expect(store.begin('42', { ...receipt, id: 'request-after-close' })).rejects.toThrow(/storage closed.*reload/i);
});
it('reports a database version change without reopening or repeating a pending action', async () => {
  const store = journal();
  await store.begin('42', receipt);
  await new Promise<void>((resolve, reject) => {
    const q = indexedDB.open('chatthing-moderation-journal', 2);
    q.onsuccess = () => {
      q.result.close();
      resolve();
    };
    q.onerror = () => reject(q.error);
  });
  await expect(store.finish('42', receipt.id, 'confirmed', 'late')).rejects.toThrow(/storage changed.*reload/i);
});
it('saves unconfirmed outcomes before completion, isolates accounts and does not resurrect deleted receipts', async () => {
  const store = journal();
  await store.begin('42', receipt);
  expect((await store.list('42')).entries[0]?.outcome).toBe('pending');
  expect((await store.list('43')).entries).toEqual([]);
  await store.finish('42', receipt.id, 'uncertain', 'Network result unknown');
  expect(journalExport(await store.list('42'))).toContain('private reason');
  const plan = await store.preview('42', { rows: 100, days: 7 });
  await store.apply(plan);
  expect(await store.finish('43', receipt.id, 'confirmed', 'wrong account')).toBe(false);
});
it('serializes concurrent writers and refuses stale retention without deleting new outcomes', async () => {
  const a = journal(),
    b = journal();
  await Promise.all([a.begin('42', receipt), b.begin('42', { ...receipt, id: 'request-0987654321' })]);
  expect((await a.list('42')).entries).toHaveLength(2);
  const plan = await a.preview('42', { rows: 100, days: 7 });
  await b.finish('42', receipt.id, 'rejected', 'Role refused');
  await expect(a.apply(plan)).rejects.toThrow('changed');
  expect((await a.list('42')).entries).toHaveLength(2);
});
it('enforces explicit retention without silently discarding unresolved pending outcomes on new writes', async () => {
  const a = journal();
  await a.begin('42', { ...receipt, at: Date.now() - 10 * 86400000 });
  const plan = await a.preview('42', { rows: 100, days: 7 });
  expect(plan.remove).toBe(1);
  expect((await a.list('42')).entries).toHaveLength(1);
  await a.apply(plan);
  expect((await a.list('42')).entries).toEqual([]);
  expect(await a.finish('42', receipt.id, 'confirmed', 'late')).toBe(false);
  await expect(a.begin('42', { ...receipt, command: '/w alice secret' })).rejects.toThrow('Invalid');
});

it('preserves terminal outcomes and refuses capacity exhaustion before admitting another action', async () => {
  const a = journal();
  await a.apply(await a.preview('42', { rows: 100, days: 0 }));
  for (let i = 0; i < 100; i++) await a.begin('42', { ...receipt, id: 'request-' + String(i).padStart(16, '0') });
  await expect(a.begin('42', { ...receipt, id: 'request-over-capacity' })).rejects.toThrow();
  expect((await a.list('42')).entries).toHaveLength(100);
  const first = (await a.list('42')).entries[0]!;
  await a.finish('42', first.id, 'uncertain', 'unknown');
  expect(await a.finish('42', first.id, 'confirmed', 'late acknowledgement')).toBe(false);
  expect((await a.list('42')).entries[0]?.outcome).toBe('uncertain');
  await a.begin('42', { ...receipt, id: 'request-after-resolved' });
  expect((await a.list('42')).entries).toHaveLength(100);
  expect((await a.list('42')).entries.some((e) => e.id === first.id)).toBe(false);
});

it('preserves quota errors through the worker boundary and permits an explicit retry after recovery', async () => {
  const store = journal();
  const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => {
    throw new DOMException('Fixture storage quota denied', 'QuotaExceededError');
  });
  await expect(store.begin('42', receipt)).rejects.toMatchObject({ name: 'QuotaExceededError' });
  expect((await store.list('42')).entries).toEqual([]);
  put.mockRestore();
  await store.begin('42', receipt);
  expect((await store.list('42')).entries[0]?.outcome).toBe('pending');
});

it('clones request and response graphs and drains admitted writes before stopping', async () => {
  const store = journal();
  const input = { ...receipt };
  const write = store.begin('42', input);
  input.command = '/w alice must not cross the boundary';
  await write;
  const value = await store.list('42');
  value.entries[0]!.command = '/w alice caller mutation';
  expect((await store.list('42')).entries[0]?.command).toBe(receipt.command);
  const finish = store.finish('42', receipt.id, 'confirmed', 'Provider confirmed');
  const stopped = store.stop();
  await Promise.all([finish, stopped]);
  await expect(store.begin('42', { ...receipt, id: 'request-after-stop' })).rejects.toThrow(/stopped|unavailable/);
  expect((await journal().list('42')).entries[0]?.outcome).toBe('confirmed');
});
