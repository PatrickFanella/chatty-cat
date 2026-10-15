// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { TabSync } from './tab-sync';
import type { ChatMessage } from './protocol';
const opened: FakeChannel[] = [];
class FakeChannel extends EventTarget {
  closed = false;
  constructor(readonly name: string) {
    super();
    opened.push(this);
  }
  postMessage(data: unknown): void {
    for (const channel of opened)
      if (channel !== this && !channel.closed && channel.name === this.name)
        channel.dispatchEvent(new MessageEvent('message', { data }));
  }
  close(): void {
    this.closed = true;
  }
}
afterEach(() => {
  vi.unstubAllGlobals();
  opened.splice(0);
});
const message: ChatMessage = {
  id: 'id',
  command: 'PRIVMSG',
  channel: 'room',
  login: 'alice',
  text: 'hello',
  timestamp: 1,
  tags: { 'local-echo': '1' },
};
it('shares accepted echoes with other tabs and stops listeners', () => {
  vi.stubGlobal('BroadcastChannel', FakeChannel);
  const receive = vi.fn();
  const first = new TabSync(vi.fn());
  const second = new TabSync(receive);
  first.send(message);
  expect(receive).toHaveBeenCalledWith(message);
  second.stop();
  first.send(message);
  expect(receive).toHaveBeenCalledTimes(1);
  first.stop();
});
it('rejects invalid, oversized and unaccepted payloads', () => {
  vi.stubGlobal('BroadcastChannel', FakeChannel);
  const receive = vi.fn();
  const sync = new TabSync(receive);
  const channel = opened[0]!;
  for (const data of [
    { type: 'auth', secret: 'fake' },
    { type: 'message', message: { ...message, tags: {} } },
    { type: 'message', message: { ...message, text: 'x'.repeat(40000) } },
  ])
    channel.dispatchEvent(new MessageEvent('message', { data }));
  expect(receive).not.toHaveBeenCalled();
  sync.stop();
});
it('continues on browsers without BroadcastChannel', () => {
  vi.stubGlobal('BroadcastChannel', undefined);
  const sync = new TabSync(vi.fn());
  expect(() => sync.send(message)).not.toThrow();
  sync.stop();
});
it('isolates accepted echoes by account and stops receiving when identity is unknown', () => {
  vi.stubGlobal('BroadcastChannel', FakeChannel);
  const receive = vi.fn(),
    a = new TabSync(vi.fn()),
    b = new TabSync(receive);
  a.setAccount('42');
  b.setAccount('43');
  a.send(message);
  expect(receive).not.toHaveBeenCalled();
  b.setAccount('42');
  a.send(message);
  expect(receive).toHaveBeenCalledOnce();
  b.setAccount(undefined);
  a.send(message);
  expect(receive).toHaveBeenCalledOnce();
  a.stop();
  b.stop();
});
