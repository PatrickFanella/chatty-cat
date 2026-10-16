// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { StorageWorkerClient } from './storage-worker-client';
import type { StorageRequest } from './storage-worker-protocol';
class Port extends EventTarget {
  sent: StorageRequest[] = [];
  terminate = vi.fn();
  postMessage(value: StorageRequest): void {
    this.sent.push(structuredClone(value));
  }
  reply(id: number, result: unknown): void {
    this.dispatchEvent(new MessageEvent('message', { data: { version: 1, id, ok: true, result } }));
  }
}
const clients: { value: StorageWorkerClient; port: Port }[] = [];
function client(timeout = 30000) {
  const port = new Port();
  const value = new StorageWorkerClient(() => port as unknown as Worker, timeout);
  clients.push({ value, port });
  return { port, value };
}
afterEach(async () => {
  // Finish idle clients without leaving protocol timers in the test process.
  for (const { value, port } of clients.splice(0)) {
    // A terminal transport failure rejects pending calls and prevents a stop replay.
    port.dispatchEvent(new Event('error'));
    await value.stop();
  }
  vi.useRealTimers();
});
it('correlates out-of-order replies without confusing account-scoped reads', async () => {
  const { port, value } = client();
  const a = value.request('journal.list', '42'),
    b = value.request('journal.list', '43');
  port.reply(2, { account: '43', entries: [] });
  port.reply(1, { account: '42', entries: [] });
  await expect(a).resolves.toMatchObject({ account: '42' });
  await expect(b).resolves.toMatchObject({ account: '43' });
});
it('closes permanently after a worker crash and never resubmits pending operations', async () => {
  const { port, value } = client();
  const pending = value.request('journal.list', '42');
  port.dispatchEvent(new Event('error'));
  await expect(pending).rejects.toThrow(/check retained receipts.*No automatic retry/);
  await expect(value.request('journal.list', '42')).rejects.toThrow('worker unavailable');
  expect(port.sent).toHaveLength(1);
  expect(port.terminate).toHaveBeenCalledOnce();
});
it('treats a lost acknowledgement as unavailable, with no timeout retry', async () => {
  vi.useFakeTimers();
  const { port, value } = client(100);
  const pending = value.request('journal.finish', '42', 'request-1234567890', 'confirmed', 'Provider confirmed');
  const result = expect(pending).rejects.toThrow('worker unavailable');
  await vi.advanceTimersByTimeAsync(100);
  await result;
  expect(port.sent).toHaveLength(1);
  expect(port.terminate).toHaveBeenCalledOnce();
  await expect(value.request('journal.list', '42')).rejects.toThrow('worker unavailable');
});
it.each(['messageerror', 'malformed'])('fails closed for %s and rejects every pending call', async (kind) => {
  const { port, value } = client();
  const calls = [value.request('journal.list', '42'), value.request('journal.list', '43')];
  const results = calls.map((call) => expect(call).rejects.toThrow('worker unavailable'));
  port.dispatchEvent(
    kind === 'messageerror' ? new Event('messageerror') : new MessageEvent('message', { data: { version: 99 } }),
  );
  await Promise.all(results);
  expect(port.sent).toHaveLength(2);
});
it('refuses a queue beyond its bound without sending another message', async () => {
  const { port, value } = client();
  const pending = Array.from({ length: 64 }, () => value.request('journal.list', '42').catch(() => {}));
  await expect(value.request('journal.list', '42')).rejects.toThrow('busy');
  expect(port.sent).toHaveLength(64);
  port.dispatchEvent(new Event('error'));
  await Promise.all(pending);
});
it('sends one stop, rejects new work immediately, and terminates after the acknowledgement', async () => {
  const { port, value } = client();
  const stopped = value.stop();
  expect(value.stop()).toBe(stopped);
  await expect(value.request('journal.list', '42')).rejects.toThrow('stopped');
  expect(port.terminate).not.toHaveBeenCalled();
  expect(port.sent[0]?.operation).toBe('stop');
  port.reply(1, undefined);
  await stopped;
  expect(port.terminate).toHaveBeenCalledOnce();
});
it('keeps constructor and structured-clone failures closed without a main-thread fallback', async () => {
  const unavailable = new StorageWorkerClient(() => {
    throw new Error('Worker denied');
  });
  await expect(unavailable.request('journal.list', '42')).rejects.toThrow('worker unavailable');
  await unavailable.stop();
  const { port, value } = client();
  vi.spyOn(port, 'postMessage').mockImplementation(() => {
    throw new DOMException('Fixture clone failure', 'DataCloneError');
  });
  await expect(value.request('journal.list', '42')).rejects.toThrow('worker unavailable');
  expect(port.terminate).toHaveBeenCalledOnce();
});

it('admits shutdown when the request queue is full and drains before terminating', async () => {
  const { port, value } = client();
  const pending = Array.from({ length: 64 }, () => value.request('journal.list', '42'));
  const stopped = value.stop();
  expect(port.sent.at(-1)?.operation).toBe('stop');
  for (let id = 1; id <= 64; id++) port.reply(id, { account: '42', entries: [] });
  await Promise.all(pending);
  expect(port.terminate).not.toHaveBeenCalled();
  port.reply(65, undefined);
  await stopped;
  expect(port.terminate).toHaveBeenCalledOnce();
});

it('cancels archive reads without replaying them or poisoning later requests', async () => {
  const { port, value } = client();
  const controller = new AbortController();
  const pending = value.query('archive.searchPage', [{ text: 'absent' }, undefined], { signal: controller.signal });
  controller.abort();
  await expect(pending).rejects.toHaveProperty('name', 'AbortError');
  expect(port.sent).toHaveLength(2);
  expect(port.sent[1]).toEqual({ version: 1, cancel: 1 });
  port.reply(1, { messages: [] });
  const next = value.query('archive.search', [{ text: 'next' }]);
  port.reply(2, []);
  await expect(next).resolves.toEqual([]);
  expect(port.terminate).not.toHaveBeenCalled();
});
it('routes progress and aborts before posting a pre-cancelled query', async () => {
  const { port, value } = client();
  const controller = new AbortController();
  controller.abort();
  await expect(value.query('archive.search', [{ text: '' }], { signal: controller.signal })).rejects.toHaveProperty(
    'name',
    'AbortError',
  );
  expect(port.sent).toHaveLength(0);
  const progress = vi.fn();
  const pending = value.query('archive.searchPage', [{ text: '' }, undefined], { progress });
  port.dispatchEvent(new MessageEvent('message', { data: { version: 1, id: 1, progress: 250 } }));
  expect(progress).toHaveBeenCalledWith(250);
  port.reply(1, { messages: [], scanned: 250 });
  await expect(pending).resolves.toMatchObject({ scanned: 250 });
});
