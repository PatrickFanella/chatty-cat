// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { BrowserCompanion } from './browser-companion';
import { FIREFOX_COMPANION_ID } from './browser-companion-id';
import { setProfileScope } from './account-profiles';
import { BrowserCompanionRegistry } from './browser-companion-registry';
import { external, pairingCode, sendWatched, type BridgeState } from '../../companion/browser/core.js';
const origin = 'https://chat.subcult.tv';
const auth = {
  enabled: true,
  authenticated: true,
  loginURL: origin + '/api/auth/login',
  userID: '42',
  login: 'viewer',
  csrf: 'private-canary',
};
afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  setProfileScope('anonymous');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('pairs and receives through Firefox page messaging without forwarding app secrets', async () => {
  vi.stubGlobal('location', new URL(origin));
  setProfileScope('42');
  const state: BridgeState = {};
  const code = pairingCode(state);
  const calls: unknown[] = [];
  const post = vi.spyOn(window, 'postMessage').mockImplementation((value: unknown) => {
    const data = value as Record<string, unknown>;
    if (data.direction !== 'request') return;
    calls.push(data.payload);
    const response = external(state, data.payload, { url: origin + '/', origin, frameId: 0, tab: { id: 1 } });
    queueMicrotask(() =>
      window.dispatchEvent(
        new MessageEvent('message', {
          source: window,
          origin,
          data: { ...data, direction: 'response', value: response },
        }),
      ),
    );
  });
  const client = new BrowserCompanion(() => auth);
  try {
    await client.pair(FIREFOX_COMPANION_ID, code);
    sendWatched(state, 'https://www.twitch.tv/one');
    expect(await client.poll()).toEqual({ channel: 'one', seq: 1 });
    expect(JSON.stringify(calls)).not.toContain('private-canary');
    expect(post).toHaveBeenCalled();
  } finally {
    client.disconnect();
    await Promise.resolve();
  }
  const registry = new BrowserCompanionRegistry('42');
  registry.remember(FIREFOX_COMPANION_ID, 'Firefox');
  expect(registry.all()).toEqual([{ id: FIREFOX_COMPANION_ID, name: 'Firefox' }]);
});
it('content relay refuses other origins, frames, extension IDs and oversized payloads', async () => {
  const listeners: ((event: unknown) => Promise<void>)[] = [];
  const postMessage = vi.fn(),
    sendMessage = vi.fn().mockResolvedValue({ ok: true, version: 1 });
  const page = {
    top: null as unknown,
    addEventListener: (_name: string, fn: (event: unknown) => Promise<void>) => listeners.push(fn),
    postMessage,
  };
  page.top = page;
  const api = { runtime: { id: FIREFOX_COMPANION_ID, sendMessage } };
  const script = readFileSync('../companion/browser/firefox-content.js', 'utf8');
  runInNewContext(script, { window: page, location: new URL(origin), browser: api });
  const data = {
    bridge: 'chatty-cat-companion',
    direction: 'request',
    extension: FIREFOX_COMPANION_ID,
    request: 'a'.repeat(64),
    payload: { kind: 'pair', version: 1, account: '42', code: 'b'.repeat(64) },
  };
  const valid = { source: page, origin, data };
  for (const bad of [
    { ...valid, origin: 'https://evil.example' },
    { ...valid, source: {} },
    { ...valid, data: { ...data, extension: 'other@subcult.tv' } },
    { ...valid, data: { ...data, payload: { text: 'x'.repeat(2049) } } },
  ])
    await listeners[0]!(bad);
  expect(sendMessage).not.toHaveBeenCalled();
  await listeners[0]!(valid);
  expect(sendMessage).toHaveBeenCalledWith({ kind: 'app-message', payload: data.payload });
  expect(postMessage).toHaveBeenCalledWith(
    {
      bridge: data.bridge,
      direction: 'response',
      extension: data.extension,
      request: data.request,
      value: { ok: true, version: 1 },
    },
    origin,
  );
  const subframe = { ...page, top: {}, addEventListener: vi.fn() };
  runInNewContext(script, { window: subframe, location: new URL(origin), browser: api });
  expect(subframe.addEventListener).not.toHaveBeenCalled();
});
it('background relay validates browser-supplied sender and keeps popup actions separate', async () => {
  let receive!: (message: unknown, sender: unknown, respond: (value: unknown) => void) => boolean;
  let bridge: BridgeState = {};
  const api = {
    runtime: {
      id: FIREFOX_COMPANION_ID,
      getURL: (path: string) => 'moz-extension://fixture/' + path,
      onMessageExternal: { addListener: vi.fn() },
      onMessage: {
        addListener: (fn: typeof receive) => {
          receive = fn;
        },
      },
    },
    storage: {
      session: {
        get: async () => ({ bridge }),
        set: async (value: { bridge: BridgeState }) => {
          bridge = value.bridge;
        },
      },
    },
    tabs: { onRemoved: { addListener: vi.fn() } },
  };
  const code = readFileSync('../companion/browser/background.js', 'utf8').replace(/^import[^;]+;/m, '');
  runInNewContext(code, { browser: api, pairingCode, external, sendWatched, URL });
  const request = (message: unknown, sender: unknown) => new Promise((resolve) => receive(message, sender, resolve));
  const popup = { id: FIREFOX_COMPANION_ID, url: api.runtime.getURL('popup.html') };
  const pair = (await request({ kind: 'code' }, popup)) as { code: string };
  const page = { id: FIREFOX_COMPANION_ID, url: origin + '/', tab: { id: 1 }, frameId: 0 };
  const payload = { version: 1, kind: 'pair', account: '42', code: pair.code };
  expect(await request({ kind: 'app-message', payload }, { ...page, url: 'https://evil.example/' })).toMatchObject({
    ok: false,
  });
  expect(await request({ kind: 'app-message', payload }, { ...page, frameId: 1 })).toMatchObject({ ok: false });
  expect(await request({ kind: 'app-message', payload }, { ...page, id: 'other' })).toMatchObject({ ok: false });
  expect(await request({ kind: 'code' }, page)).toMatchObject({ ok: false });
  expect(await request({ kind: 'app-message', payload }, page)).toMatchObject({ ok: true, account: '42' });
});
