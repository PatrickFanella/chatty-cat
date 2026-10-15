// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { ChatContextPanel } from './chat-context-ui';
import { savePrivacy, resetPrivacyFallback } from './privacy';
class Source extends EventTarget {
  static all: Source[] = [];
  closed = false;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) {
    super();
    Source.all.push(this);
  }
  close() {
    this.closed = true;
  }
  emit(value: unknown) {
    this.dispatchEvent(new MessageEvent('snapshot', { data: JSON.stringify(value) }));
  }
}
let panel: ChatContextPanel | undefined;
afterEach(() => {
  panel?.stop();
  panel = undefined;
  document.body.replaceChildren();
  localStorage.clear();
  resetPrivacyFallback();
  vi.unstubAllGlobals();
  Source.all = [];
});
const auth = {
  enabled: true,
  authenticated: true,
  loginURL: 'https://chat.subcult.tv/api/auth/login',
  userID: '42',
  login: 'alice',
  csrf: 'opaque',
  chatContextEnabled: true,
};
const id = '11111111-1111-4111-8111-111111111111';
const snapshot = () => ({
  format: 'chatty-cat-public-context',
  account: '42',
  channel: 'one',
  broadcasterID: '123',
  epoch: 'a'.repeat(32),
  state: 'live',
  active: true,
  detail: 'Live',
  rows: [
    {
      id,
      eventID: 'event-one',
      userID: '99',
      command: 'PRIVMSG',
      at: Date.now(),
      tags: { 'eventsub-message-type': 'power_ups_message_effect' },
    },
  ],
});
function button(text: string): HTMLButtonElement {
  const b = [...document.querySelectorAll('button')].find((b) => b.textContent === text);
  if (!b) throw new Error('Missing ' + text);
  return b;
}
it('connects explicitly, permits an explicit hidden connection, and clears late data on account/privacy change', () => {
  document.body.innerHTML = '<button id="commands-open"></button>';
  vi.stubGlobal('EventSource', Source);
  let current = auth;
  const changed = vi.fn(() => 0);
  panel = new ChatContextPanel(
    () => current,
    () => ['one'],
    () => 'one',
    changed,
  );
  expect(Source.all).toHaveLength(0);
  button('Public message context').click();
  expect(Source.all).toHaveLength(0);
  button('Connect public context').click();
  expect(Source.all).toHaveLength(1);
  const source = Source.all[0]!;
  source.emit(snapshot());
  expect(changed).toHaveBeenCalledOnce();
  button('Return to chat; keep context connected').click();
  expect(panel.root.open).toBe(false);
  expect(source.closed).toBe(false);
  const message = {
    id,
    channel: 'one',
    command: 'PRIVMSG',
    login: 'someone',
    text: 'public',
    timestamp: Date.now(),
    tags: { 'room-id': '123', 'user-id': '99' },
  };
  expect(panel.enrich(message).tags['eventsub-message-type']).toBe('power_ups_message_effect');
  current = { ...auth, userID: '43' };
  panel.authChanged();
  expect(source.closed).toBe(true);
  source.emit(snapshot());
  expect(panel.enrich(message)).toBe(message);
  expect(changed).toHaveBeenCalledOnce();
  savePrivacy({ version: 1, enabled: true, allowed: [], panic: true });
  document.dispatchEvent(new Event('privacychange'));
  expect(panel.root.open).toBe(false);
});
it('closes and clears on transport failure or a malformed/private snapshot without native automatic retry', () => {
  document.body.innerHTML = '<button id="commands-open"></button>';
  vi.stubGlobal('EventSource', Source);
  panel = new ChatContextPanel(
    () => auth,
    () => ['one'],
    () => 'one',
    () => 0,
  );
  button('Public message context').click();
  button('Connect public context').click();
  const source = Source.all[0]!;
  source.emit({ ...snapshot(), rows: [{ ...snapshot().rows[0], text: 'private-canary' }] });
  expect(source.closed).toBe(true);
  expect(panel.root.textContent).not.toContain('private-canary');
  expect(localStorage.length).toBe(0);
});
