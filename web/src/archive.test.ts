// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import '../test-support/storage-worker-shim';
import { afterEach, expect, it, vi } from 'vitest';
import { MessageArchive, matchesArchive } from './archive';
import type { ChatMessage } from './protocol';
const archives: MessageArchive[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.removeItem('chatthing:v1:archive-retention');
  for (const archive of archives.splice(0)) archive.stop();
  await new Promise((resolve) => setTimeout(resolve, 20));
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('chatthing-archive');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
});
const message: ChatMessage = {
  id: 'id',
  command: 'PRIVMSG',
  channel: 'one',
  login: 'Alice',
  text: 'hello world',
  timestamp: 100,
  tags: {},
};
function archive() {
  const a = new MessageArchive();
  archives.push(a);
  return a;
}
it('stores deduplicated messages and restores them after reopening', async () => {
  const a = archive();
  a.add(message);
  a.add(message);
  await a.flush();
  expect(await a.search({ text: 'WORLD' })).toEqual([message]);
  a.stop();
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(await archive().search({ text: 'hello', channel: 'one' })).toEqual([message]);
});
it('uses channel and time ranges, newest-first limits and ignores state frames', async () => {
  const a = archive();
  a.add(message);
  a.add({ ...message, id: 'new', timestamp: 200 });
  a.add({ ...message, channel: 'two', id: 'other' });
  a.add({ ...message, command: 'ROOMSTATE', id: 'state' });
  expect((await a.search({ text: '', channel: 'one', limit: 1 }))[0]?.id).toBe('new');
  expect((await a.search({ text: '', channel: 'one', before: 150 })).map((m) => m.id)).toEqual(['id']);
  expect((await a.search({ text: '', channels: ['one'] })).map((m) => m.channel)).toEqual(['one', 'one']);
  expect(await a.search({ text: '', channels: [] })).toEqual([]);
  expect(await a.search({ text: '', after: 300, before: 10 })).toEqual([]);
  expect((await a.search({ text: '', channel: 'one', after: 100, limit: 1, order: 'oldest' }))[0]?.id).toBe('id');
});
it('supports literal text/login filters and cancelled searches', async () => {
  expect(matchesArchive(message, { text: 'hello', login: 'alice' })).toBe(true);
  expect(matchesArchive(message, { text: '.*' })).toBe(false);
  const a = archive();
  const abort = new AbortController();
  abort.abort();
  await expect(a.search({ text: '' }, abort.signal)).rejects.toHaveProperty('name', 'AbortError');
});
it('reports unavailable storage instead of returning an empty success', async () => {
  const original = indexedDB;
  vi.stubGlobal('indexedDB', undefined);
  const failure = vi.fn();
  const a = new MessageArchive(failure);
  archives.push(a);
  await expect(a.search({ text: '' })).rejects.toThrow('unavailable');
  expect(failure).toHaveBeenCalled();
  vi.stubGlobal('indexedDB', original);
});
it('prunes the oldest rows at the cap and finds IDs only in joined channels', async () => {
  const a = new MessageArchive(() => {}, 2);
  archives.push(a);
  for (let i = 1; i <= 3; i++) a.add({ ...message, id: String(i), timestamp: i });
  expect((await a.search({ text: '' })).map((m) => m.id)).toEqual(['3', '2']);
  expect(await a.get('1', ['one'])).toBeUndefined();
  expect(await a.get('3', ['two'])).toBeUndefined();
  expect((await a.get('3', ['one']))?.id).toBe('3');
});
it('restores large scrollback in chronological order only for joined channels', async () => {
  const a = archive();
  for (let i = 0; i < 1200; i++)
    a.add({ ...message, id: String(i), timestamp: i, channel: i % 3 === 0 ? 'other' : 'one' });
  const records = await a.recent(['one'], 1000);
  expect(records).toHaveLength(800);
  expect(records[0]?.timestamp).toBe(1);
  expect(records.at(-1)?.timestamp).toBe(1199);
  expect((await a.recent(['one'], 250)).map((m) => m.timestamp)).toEqual(records.slice(-250).map((m) => m.timestamp));
  expect(await a.recent([], 1000)).toEqual([]);
  const controller = new AbortController();
  controller.abort();
  await expect(a.recent(['one'], 1000, controller.signal)).rejects.toHaveProperty('name', 'AbortError');
});
it('pages equal-time rows without repeats and reports retained archive boundaries', async () => {
  const a = archive();
  for (let i = 0; i < 7; i++) a.add({ ...message, id: String(i), timestamp: 100, channel: i === 0 ? 'two' : 'one' });
  const seen: string[] = [];
  let cursor;
  do {
    const page = await a.searchPage({ text: '', channels: ['one'], limit: 2 }, cursor);
    seen.push(...page.messages.map((m) => m.id));
    cursor = page.next;
    expect(page.bounds).toEqual({ rows: 7, oldest: 100, newest: 100 });
  } while (cursor);
  expect(seen).toEqual(['6', '5', '4', '3', '2', '1']);
});
it('cancels an active selective cursor scan and leaves storage usable', async () => {
  const a = archive();
  for (let i = 0; i < 1000; i++) a.add({ ...message, id: String(i), timestamp: i });
  await a.flush();
  const controller = new AbortController();
  await expect(
    a.searchPage({ text: 'absent', limit: 2 }, undefined, controller.signal, () => controller.abort()),
  ).rejects.toHaveProperty('name', 'AbortError');
  expect((await a.searchPage({ text: 'hello', limit: 1 })).messages).toHaveLength(1);
});
it('recovers missing public excerpts without overwriting retained moderation state or exceeding capacity', async () => {
  const a = new MessageArchive(() => {}, 2);
  archives.push(a);
  a.add({ ...message, tags: { deleted: '1' } });
  await a.flush();
  expect(await a.recoverMissing([message, { ...message, id: 'recovered', timestamp: 200 }])).toBe(1);
  expect((await a.get('id', ['one']))?.tags.deleted).toBe('1');
  await expect(a.recoverMissing([{ ...message, id: 'full', timestamp: 300 }])).rejects.toThrow('full');
  expect(await a.get('full', ['one'])).toBeUndefined();
  await expect(a.recoverMissing([{ ...message, command: 'WHISPER' }])).rejects.toThrow('public');
});
it('streams every channel row chronologically without the normal result cap and supports active cancellation', async () => {
  const a = archive();
  for (let i = 0; i < 700; i++) a.add({ ...message, id: String(i), timestamp: i });
  a.add({ ...message, channel: 'two' });
  const rows: ChatMessage[] = [];
  await a.scanChannel('one', (m) => rows.push(m));
  expect(rows).toHaveLength(700);
  expect(rows[0]?.timestamp).toBe(0);
  expect(rows.at(-1)?.timestamp).toBe(699);
  const controller = new AbortController();
  let visited = 0;
  await expect(
    a.scanChannel(
      'one',
      () => {
        if (++visited === 50) controller.abort();
      },
      controller.signal,
    ),
  ).rejects.toHaveProperty('name', 'AbortError');
  expect(visited).toBe(50);
});
it('previews age/cap retention without deleting, applies only a current reviewed plan, and persists future-save policy', async () => {
  localStorage.removeItem('chatthing:v1:archive-retention');
  const a = archive(),
    now = Date.now();
  a.add({ ...message, id: 'old', timestamp: now - 10 * 86400000 });
  a.add({ ...message, id: 'new', timestamp: now });
  const plan = await a.retentionPreview({ rows: 1000, days: 7 });
  expect(plan.remove).toBe(1);
  expect(await a.get('old', ['one'])).toBeDefined();
  a.add({ ...message, id: 'changed', timestamp: now + 1 });
  await expect(a.applyRetention(plan)).rejects.toThrow('changed');
  expect(await a.get('old', ['one'])).toBeDefined();
  const current = await a.retentionPreview({ rows: 1000, days: 7 });
  await a.applyRetention(current);
  expect(await a.get('old', ['one'])).toBeUndefined();
  a.add({ ...message, id: 'old-again', timestamp: now - 10 * 86400000 });
  await a.flush();
  expect(await a.get('old-again', ['one'])).toBeUndefined();
  localStorage.removeItem('chatthing:v1:archive-retention');
});
it('keeps archived records if retention policy storage fails', async () => {
  localStorage.removeItem('chatthing:v1:archive-retention');
  const a = archive();
  a.add({ ...message, timestamp: 0 });
  const plan = await a.retentionPreview({ rows: 1000, days: 7 });
  const native = localStorage;
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => native.getItem(key),
    setItem: () => {
      throw new Error('quota');
    },
    removeItem: (key: string) => native.removeItem(key),
  });
  await expect(a.applyRetention(plan)).rejects.toThrow('quota');
  vi.stubGlobal('localStorage', native);
  expect(await a.get('id', ['one'])).toBeDefined();
  localStorage.removeItem('chatthing:v1:archive-retention');
});
it('rejects private records already present in storage across every archive read path', async () => {
  const a = archive();
  a.add(message);
  await a.flush();
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const q = indexedDB.open('chatthing-archive', 1);
    q.onsuccess = () => resolve(q.result);
    q.onerror = () => reject(q.error);
  });
  const tx = db.transaction('messages', 'readwrite');
  tx.objectStore('messages').put({
    key: 'one:private',
    channel: 'one',
    timestamp: 101,
    message: { ...message, id: 'private', timestamp: 101, command: 'WHISPER', text: 'private body' },
  });
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
  db.close();
  expect((await a.search({ text: '' })).map((m) => m.id)).toEqual(['id']);
  expect((await a.searchPage({ text: '' })).messages.map((m) => m.id)).toEqual(['id']);
  expect((await a.recent(['one'], 100)).map((m) => m.id)).toEqual(['id']);
  expect(await a.get('private', ['one'])).toBeUndefined();
  const rows: ChatMessage[] = [];
  await a.scanChannel('one', (m) => rows.push(m));
  expect(rows.map((m) => m.id)).toEqual(['id']);
});

it('evaluates serialized query expressions and command filters inside the worker', async () => {
  const a = archive();
  a.add({ ...message, tags: { badges: 'moderator/1' } });
  a.add({ ...message, id: 'notice', command: 'NOTICE', text: 'hello notice' });
  expect(
    (await a.search({ text: '', expression: 'sender:alice badge:moderator text:hello' })).map((m) => m.id),
  ).toEqual(['id']);
  expect((await a.searchPage({ text: '', commands: ['NOTICE'] })).messages.map((m) => m.id)).toEqual(['notice']);
  await expect(a.search({ text: '', expression: 'regex:"(a+)+$"' })).rejects.toThrow();
});
it('keeps moderation user-ID and imported-history matching equivalent across the worker boundary', async () => {
  const a = archive();
  a.add({ ...message, id: 'id-match', login: 'renamed', tags: { 'user-id': '42' } });
  a.add({ ...message, id: 'wrong-id', tags: { 'user-id': '43' } });
  a.add({ ...message, id: 'imported', tags: { 'user-id': '43', 'imported-history': 'true' } });
  a.add({ ...message, id: 'missing-id' });
  a.add({ ...message, id: 'private', command: 'WHISPER', tags: { 'user-id': '42' } });
  const named = await a.searchPage({ text: '', moderationTarget: { id: '42', login: 'alice' } });
  expect(named.messages.map((m) => m.id).sort()).toEqual(['id-match', 'imported', 'missing-id']);
  const numeric = await a.searchPage({ text: '', moderationTarget: { id: '42' } });
  expect(numeric.messages.map((m) => m.id)).toEqual(['id-match']);
});
it('streams equal-time rows across bounded pages without duplicate callbacks', async () => {
  const a = archive();
  for (let i = 0; i < 245; i++) a.add({ ...message, id: String(i).padStart(3, '0') });
  const ids: string[] = [];
  await a.scanChannel('one', (m) => ids.push(m.id));
  expect(ids).toHaveLength(245);
  expect(new Set(ids).size).toBe(245);
  expect(ids).toEqual([...ids].sort());
});

it('reports cancellation when Chromium-style transaction error precedes the abort event', async () => {
  const a = archive();
  for (let i = 0; i < 300; i++) a.add({ ...message, id: String(i), timestamp: i });
  await a.flush();
  const { StorageWorkerHost } = await import('./storage-worker-host');
  const host = new StorageWorkerHost();
  const transaction = IDBDatabase.prototype.transaction;
  vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (this: IDBDatabase, ...args) {
    const tx = transaction.apply(this, args);
    const abort = tx.abort.bind(tx);
    tx.abort = () => {
      tx.dispatchEvent(new Event('error'));
      abort();
    };
    return tx;
  });
  try {
    const result = await host.handle(
      { version: 1, id: 777, operation: 'archive.searchPage', args: [{ text: 'absent' }, undefined] },
      () => {
        void host.handle({ version: 1, cancel: 777 });
      },
    );
    expect(result).toMatchObject({ ok: false, error: { name: 'AbortError' } });
  } finally {
    await host.stop();
  }
});

it('fixes a channel scan upper cursor so newer live appends cannot extend the scan', async () => {
  const a = archive();
  for (let i = 0; i < 245; i++) a.add({ ...message, id: String(i).padStart(3, '0'), timestamp: i });
  await a.flush();
  const { StorageWorkerClient } = await import('./storage-worker-client');
  const worker = new StorageWorkerClient();
  try {
    const first = await worker.request('archive.scanPage', 'one', undefined, undefined);
    a.add({ ...message, id: 'live-after-start', timestamp: 300 });
    await a.flush();
    const ids = first.messages.map((m) => m.id);
    let after = first.next;
    while (after) {
      const page = await worker.request('archive.scanPage', 'one', after, first.until);
      ids.push(...page.messages.map((m) => m.id));
      after = page.next;
    }
    expect(ids).toHaveLength(245);
    expect(ids).not.toContain('live-after-start');
  } finally {
    await worker.stop();
  }
});

it('rolls back a failed append batch, then retries its queued messages after a definite quota failure', async () => {
  const a = archive();
  a.add(message);
  a.add({ ...message, id: 'second', timestamp: 200 });
  const original = IDBObjectStore.prototype.put;
  let puts = 0;
  const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
    if (++puts === 2) throw new DOMException('quota fixture', 'QuotaExceededError');
    return original.apply(this, args);
  });
  await expect(a.flush()).rejects.toHaveProperty('name', 'QuotaExceededError');
  put.mockRestore();
  const db = await new Promise<IDBDatabase>((resolve) => {
    const open = indexedDB.open('chatthing-archive', 1);
    open.onsuccess = () => resolve(open.result);
  });
  const count = db.transaction('messages', 'readonly').objectStore('messages').count();
  expect(
    await new Promise((resolve) => {
      count.onsuccess = () => resolve(count.result);
    }),
  ).toBe(0);
  db.close();
  await a.flush();
  expect((await a.search({ text: '' })).map((m) => m.id)).toEqual(['second', 'id']);
});
it('rolls back every recovery insert when the reviewed excerpts exceed remaining capacity', async () => {
  const a = new MessageArchive(() => {}, 2);
  archives.push(a);
  a.add(message);
  await a.flush();
  await expect(
    a.recoverMissing([
      { ...message, id: 'first' },
      { ...message, id: 'second' },
    ]),
  ).rejects.toThrow('full');
  expect((await a.search({ text: '' })).map((m) => m.id)).toEqual(['id']);
  const controller = new AbortController();
  controller.abort();
  await expect(a.recoverMissing([{ ...message, id: 'cancelled' }], controller.signal)).rejects.toHaveProperty(
    'name',
    'AbortError',
  );
  expect(await a.get('cancelled', ['one'])).toBeUndefined();
});
it('flushes the final queued append before stopping the worker', async () => {
  const a = archive();
  a.add(message);
  a.stop();
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(await archive().get('id', ['one'])).toEqual(message);
});
it('rejects private and oversized batches inside the worker before any append', async () => {
  const { StorageWorkerClient } = await import('./storage-worker-client');
  const worker = new StorageWorkerClient();
  try {
    await expect(
      worker.request('archive.append', [message, { ...message, id: 'private', command: 'WHISPER' }]),
    ).rejects.toThrow('public');
    await expect(
      worker.request(
        'archive.append',
        Array.from({ length: 2001 }, () => message),
      ),
    ).rejects.toThrow('2000');
    expect(await worker.request('archive.search', { text: '' })).toEqual([]);
  } finally {
    await worker.stop();
  }
});
