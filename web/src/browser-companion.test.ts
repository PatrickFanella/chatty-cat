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
  sessionStorage.clear();
  setProfileScope('anonymous');
  resetPrivacyFallback();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.dispatchEvent(new Event('pageshow'));
});
const navigationKey = 'chatty-cat:v1:browser-companion-handoff';
const reloadKey = 'chatty-cat:v1:browser-companion-reload';
const kinds = (calls: unknown[][]) => calls.map(([, m]) => (m as { kind: string }).kind);
function fixture(pageSender = sender) {
  const state: BridgeState = {};
  const code = pairingCode(state);
  const sendMessage = vi.fn((_id: string, m: unknown, cb: (v: unknown) => void) => {
    queueMicrotask(() => cb(external(state, m, pageSender)));
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
  panel!.open();
  expect(f.sendMessage).not.toHaveBeenCalled();
  (document.querySelector('[aria-label="Installed browser companion ID"]') as HTMLInputElement).value = 'a'.repeat(32);
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
  await vi.waitFor(() => expect(apply).toHaveBeenCalledWith('active', 'one', 'changed', false));
});
it('hands a confirmed navigation to the same session and receives a second channel without pairing again', async () => {
  const page = { ...sender };
  const f = fixture(page);
  const time = vi.spyOn(Date, 'now').mockReturnValue(100000);
  const old = new BrowserCompanion(() => auth);
  await old.pair('a'.repeat(32), f.code);
  sendWatched(f.state, 'https://www.twitch.tv/patrick__eff');
  expect((await old.poll())?.channel).toBe('patrick__eff');
  await old.prepareNavigation('next');
  const stored = JSON.stringify(sessionStorage);
  expect(stored).not.toContain(auth.csrf);
  expect(stored).not.toContain(f.state.session!.token);
  old.navigationStarted();
  old.stop();
  page.url = 'https://chat.subcult.tv/?workspace=next&channel=patrick__eff';
  time.mockReturnValue(101000);
  let nextAuth: typeof auth | undefined;
  const resumed = new BrowserCompanion(() => nextAuth);
  nextAuth = auth;
  expect(resumed.authChanged()).toBe(false);
  expect(await resumed.resumeNavigation('next')).toBe('a'.repeat(32));
  expect(sessionStorage.getItem(navigationKey)).toBeNull();
  expect(sessionStorage.getItem(reloadKey)).not.toBeNull();
  sendWatched(f.state, 'https://www.twitch.tv/another_channel');
  expect((await resumed.poll())?.channel).toBe('another_channel');
  expect(f.sendMessage.mock.calls.filter(([, m]) => (m as { kind: string }).kind === 'pair')).toHaveLength(1);
  resumed.disconnect();
});
it('refuses another session or workspace and ordinary teardown still unpairs', async () => {
  const f = fixture();
  const old = new BrowserCompanion(() => auth);
  await old.pair('a'.repeat(32), f.code);
  await old.prepareNavigation('next');
  const next = new BrowserCompanion(() => ({ ...auth, csrf: 'different-session' }));
  await expect(next.resumeNavigation('next')).rejects.toThrow('account/session');
  expect(f.sendMessage.mock.calls.some(([, m]) => (m as { kind: string }).kind === 'resume')).toBe(false);
  await old.prepareNavigation('next');
  await expect(new BrowserCompanion(() => auth).resumeNavigation('wrong')).rejects.toThrow('account/session');
  old.stop();
  await vi.waitFor(() => expect(f.state.session).toBeNull());
});
it('clears an expired handoff without sending a resume request', async () => {
  const f = fixture();
  const time = vi.spyOn(Date, 'now').mockReturnValue(100000);
  const old = new BrowserCompanion(() => auth);
  await old.pair('a'.repeat(32), f.code);
  await old.prepareNavigation('next');
  old.navigationStarted();
  old.stop();
  time.mockReturnValue(130001);
  // The tab's reload code still applies within the extension's heartbeat lease.
  expect(await new BrowserCompanion(() => auth).resumeNavigation('next')).toBe('a'.repeat(32));
  expect(sessionStorage.getItem(navigationKey)).toBeNull();
  expect(kinds(f.sendMessage.mock.calls)).not.toContain('resume');
  expect(kinds(f.sendMessage.mock.calls)).toContain('resume-reload');
});
it('resumes a reload of the paired tab once, with a rotated token and no second pairing', async () => {
  const f = fixture();
  const time = vi.spyOn(Date, 'now').mockReturnValue(100000);
  const old = new BrowserCompanion(() => auth);
  await old.pair('a'.repeat(32), f.code);
  const first = f.state.session!.token;
  const stored = sessionStorage.getItem(reloadKey)!;
  expect(stored).not.toContain(auth.csrf);
  expect(stored).not.toContain(first);
  window.dispatchEvent(new Event('pagehide'));
  old.stop();
  expect(kinds(f.sendMessage.mock.calls)).not.toContain('unpair');
  time.mockReturnValue(110000);
  const page = new BrowserCompanion(() => auth);
  expect(page.authChanged()).toBe(false);
  expect(await page.resumeNavigation('active')).toBe('a'.repeat(32));
  expect(f.state.session!.token).not.toBe(first);
  sendWatched(f.state, 'https://www.twitch.tv/one', 110001);
  time.mockReturnValue(112000);
  expect((await page.poll())?.channel).toBe('one');
  expect(kinds(f.sendMessage.mock.calls).filter((k) => k === 'pair')).toHaveLength(1);
  // The consumed code cannot be replayed, and explicit unpair clears the record.
  sessionStorage.setItem(reloadKey, stored);
  await expect(new BrowserCompanion(() => auth).resumeNavigation('active')).rejects.toThrow('reload handoff refused');
  page.disconnect();
  expect(sessionStorage.getItem(reloadKey)).toBeNull();
  await vi.waitFor(() => expect(f.state.session).toBeNull());
});
it('refuses a reload for another account/session and still unpairs when no page unload happened', async () => {
  const f = fixture();
  const old = new BrowserCompanion(() => auth);
  await old.pair('a'.repeat(32), f.code);
  await expect(
    new BrowserCompanion(() => ({ ...auth, csrf: 'different-session' })).resumeNavigation('active'),
  ).rejects.toThrow('account/session');
  expect(kinds(f.sendMessage.mock.calls)).not.toContain('resume-reload');
  const again = new BrowserCompanion(() => auth);
  await again.pair('a'.repeat(32), pairingCode(f.state));
  again.stop();
  await vi.waitFor(() => expect(f.state.session).toBeNull());
  expect(sessionStorage.getItem(reloadKey)).toBeNull();
});
it('keeps the old reload behavior with a companion that cannot arm a reload', async () => {
  const f = fixture();
  const original = f.sendMessage.getMockImplementation()!;
  f.sendMessage.mockImplementation((id, m, cb) =>
    (m as { kind: string }).kind === 'arm-reload'
      ? queueMicrotask(() => cb({ ok: false, error: 'unsupported request' }))
      : original(id, m, cb),
  );
  const old = new BrowserCompanion(() => auth);
  await old.pair('a'.repeat(32), f.code);
  expect(sessionStorage.getItem(reloadKey)).toBeNull();
  window.dispatchEvent(new Event('pagehide'));
  old.stop();
  await vi.waitFor(() => expect(f.state.session).toBeNull());
});
it('aborts navigation handoff when per-tab storage cannot be written', async () => {
  const f = fixture();
  const client = new BrowserCompanion(() => auth);
  await client.pair('a'.repeat(32), f.code);
  const write = vi.spyOn(sessionStorage, 'setItem').mockImplementation(() => {
    throw new Error('Storage unavailable');
  });
  await expect(client.prepareNavigation('next')).rejects.toThrow('Storage unavailable');
  write.mockRestore();
  expect(f.sendMessage.mock.calls.some(([, m]) => (m as { kind: string }).kind === 'handoff')).toBe(false);
  expect(f.state.session).not.toBeNull();
  client.stop();
});
it('rechecks the reviewed destination after an asynchronous handoff and cancels a stale review', async () => {
  const f = fixture(),
    apply = vi.fn();
  let revision = 'one';
  let finish: (() => void) | undefined;
  const original = f.sendMessage.getMockImplementation()!;
  f.sendMessage.mockImplementation((id, m, cb) => {
    const kind = (m as { kind: string }).kind;
    if (kind === 'handoff') finish = () => original(id, m, cb);
    else
      original(id, m, (v) => {
        if (kind === 'pair') sendWatched(f.state, 'https://www.twitch.tv/patrick__eff');
        cb(v);
      });
  });
  panel = new BrowserCompanionPanel(
    () => auth,
    () => [{ id: 'active', name: 'Active', channels: [], revision }],
    () => 'active',
    apply,
  );
  panel.open();
  (panel.root.querySelector('[aria-label="Installed browser companion ID"]') as HTMLInputElement).value = 'a'.repeat(
    32,
  );
  (panel.root.querySelector('[aria-label="Browser companion pairing code"]') as HTMLInputElement).value = f.code;
  button('Pair browser companion').click();
  await vi.waitFor(() => expect(panel!.root.textContent).toContain('Received #patrick__eff'));
  button('Review received watched channel').click();
  await Promise.resolve();
  button('Open reviewed channel').click();
  await vi.waitFor(() => expect(finish).toBeDefined());
  revision = 'changed';
  finish!();
  await vi.waitFor(() => expect(panel!.root.textContent).toContain('review changed or expired'));
  expect(apply).not.toHaveBeenCalled();
  expect(sessionStorage.getItem(navigationKey)).toBeNull();
  await vi.waitFor(() => expect(f.state.session?.handoff).toBeNull());
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
  panel!.open();
  savePrivacy({ version: 1, enabled: true, allowed: [], panic: true });
  document.dispatchEvent(new Event('privacychange'));
  expect(panel.root.open).toBe(false);
  expect(button('Open reviewed channel').disabled).toBe(true);
  expect(f.sendMessage).not.toHaveBeenCalled();
});
