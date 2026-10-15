// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { BrowserCompanion } from './browser-companion';
import { BrowserCompanionPanel } from './browser-companion-ui';
import { setProfileScope } from './account-profiles';
import { resetPrivacyFallback, savePrivacy } from './privacy';
import { external, pairingCode, sendWatched, type BridgeState } from '../../companion/browser/core.js';
const auth = {
  enabled: true,
  authenticated: true,
  loginURL: 'https://chat.subcult.tv/api/auth/login',
  userID: '42',
  login: 'alice',
  csrf: 'private-csrf-canary',
};
const sender = { origin: 'https://chat.subcult.tv', url: 'https://chat.subcult.tv/', frameId: 0, tab: { id: 1 } };
let panel: BrowserCompanionPanel | undefined;
afterEach(() => {
  panel?.stop();
  panel = undefined;
  document.body.replaceChildren();
  localStorage.clear();
  setProfileScope('anonymous');
  resetPrivacyFallback();
  vi.unstubAllGlobals();
});
function fixture() {
  const state: BridgeState = {};
  const code = pairingCode(state);
  const sendMessage = vi.fn((_id: string, m: unknown, cb: (v: unknown) => void) => {
    queueMicrotask(() => cb(external(state, m, sender)));
  });
  vi.stubGlobal('chrome', { runtime: { sendMessage } });
  setProfileScope('42');
  return { state, code, sendMessage };
}
function button(label: string): HTMLButtonElement {
  const b = [...document.querySelectorAll('button')].find((b) => b.textContent === label);
  if (!b) throw new Error(label);
  return b;
}
it('is idle until explicit pair, forwards no app secrets and revokes on session change', async () => {
  const f = fixture();
  let current = auth;
  const c = new BrowserCompanion(() => current);
  expect(f.sendMessage).not.toHaveBeenCalled();
  await c.pair('a'.repeat(32), f.code);
  sendWatched(f.state, 'https://www.twitch.tv/one');
  expect(await c.poll()).toEqual({ channel: 'one', seq: 1 });
  expect(JSON.stringify(f.sendMessage.mock.calls)).not.toContain('private-csrf-canary');
  current = { ...auth, csrf: 'new-session' };
  expect(c.authChanged()).toBe(true);
  await Promise.resolve();
  expect(f.state.session).toBeNull();
  await expect(c.poll()).rejects.toThrow('Pair');
});
it('rejects stale pairing and removal without applying a channel', async () => {
  fixture();
  let finish!: (v: unknown) => void;
  const sendMessage = vi.fn((_id: string, _m: unknown, cb: (v: unknown) => void) => {
    finish = cb;
  });
  vi.stubGlobal('chrome', { runtime: { sendMessage } });
  let current = auth;
  const c = new BrowserCompanion(() => current);
  const p = c.pair('a'.repeat(32), 'b'.repeat(64));
  current = { ...auth, userID: '43' };
  c.authChanged();
  finish({ ok: true, version: 1, account: '42', token: 'c'.repeat(64) });
  await expect(p).rejects.toThrow('changed');
  c.disconnect();
});
it('requires a reviewed destination; opening/pairing/polling cannot mutate a workspace', async () => {
  const f = fixture(),
    apply = vi.fn();
  document.body.innerHTML = '<button id="commands-open"></button>';
  let revision = 'one';
  panel = new BrowserCompanionPanel(
    () => auth,
    () => [{ id: 'active', name: 'Active', channels: ['original'], revision }],
    () => 'active',
    apply,
  );
  button('Browser companion').click();
  expect(f.sendMessage).not.toHaveBeenCalled();
  (document.querySelector('[aria-label="Installed Chromium extension ID"]') as HTMLInputElement).value = 'a'.repeat(32);
  (document.querySelector('[aria-label="Browser companion pairing code"]') as HTMLInputElement).value = f.code;
  // Stage a watched channel immediately after pairing, before the first poll.
  const original = f.sendMessage.getMockImplementation()!;
  f.sendMessage.mockImplementation((id, m, cb) =>
    original(id, m, (v) => {
      if ((m as { kind: string }).kind === 'pair') sendWatched(f.state, 'https://www.twitch.tv/one');
      cb(v);
    }),
  );
  button('Pair browser companion').click();
  await vi.waitFor(() => expect(document.querySelector('[role="status"]')?.textContent).toContain('Received #one'));
  expect(apply).not.toHaveBeenCalled();
  button('Review received watched channel').click();
  await Promise.resolve();
  expect(apply).not.toHaveBeenCalled();
  revision = 'changed';
  button('Open reviewed channel').click();
  await Promise.resolve();
  expect(apply).not.toHaveBeenCalled();
  button('Review received watched channel').click();
  await Promise.resolve();
  button('Open reviewed channel').click();
  await Promise.resolve();
  expect(apply).toHaveBeenCalledWith('active', 'one', 'changed', false);
});
it('privacy clears pairing and pending reviews', async () => {
  const f = fixture();
  document.body.innerHTML = '<button id="commands-open"></button>';
  panel = new BrowserCompanionPanel(
    () => auth,
    () => [],
    () => '',
    vi.fn(),
  );
  button('Browser companion').click();
  savePrivacy({ version: 1, enabled: true, allowed: [], panic: true });
  document.dispatchEvent(new Event('privacychange'));
  expect(panel.root.open).toBe(false);
  expect(button('Open reviewed channel').disabled).toBe(true);
  expect(f.sendMessage).not.toHaveBeenCalled();
});
