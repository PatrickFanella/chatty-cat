// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { CompletionChatters } from './completion-chatters';
import { completionDefaults, setCompletionPreferences } from './completion-preferences';
const auth = {
  enabled: true,
  authenticated: true,
  loginURL: 'https://example.test/api/auth/login',
  userID: '42',
  login: 'fixture',
  csrf: 'fixture',
  chattersEnabled: true,
};
let source: CompletionChatters | undefined;
afterEach(() => {
  source?.stop();
  setCompletionPreferences(completionDefaults);
  localStorage.clear();
  vi.useRealTimers();
});
const page = {
  kind: 'chatters',
  channel: 'room',
  accountID: '42',
  after: 'another-page',
  observedAt: Date.now(),
  total: 200,
  items: [{ id: '1', login: 'alice', name: 'Alice' }],
};
it('refuses disabled, missing permission, unknown viewer count and threshold reads before fetching', async () => {
  let context = { auth, channel: 'room', viewers: undefined as number | undefined };
  const fetcher = vi.fn();
  source = new CompletionChatters(
    () => context,
    () => {},
    fetcher,
  );
  await expect(source.read()).rejects.toThrow(/Enable/);
  setCompletionPreferences({ ...completionDefaults, fetchChatters: true });
  await expect(source.read()).rejects.toThrow(/Viewer count/);
  context.viewers = 2000;
  await expect(source.read()).rejects.toThrow(/threshold/);
  context = { ...context, auth: { ...auth, chattersEnabled: false } };
  await expect(source.read()).rejects.toThrow(/consent/);
  expect(fetcher).not.toHaveBeenCalled();
});
it('loads one context-checked page, enforces cooldown and isolates cached names by account/channel', async () => {
  let context = { auth, channel: 'room', viewers: 10 };
  setCompletionPreferences({ ...completionDefaults, fetchChatters: true });
  const fetcher = vi.fn(async () => new Response(JSON.stringify(page)));
  source = new CompletionChatters(
    () => context,
    () => {},
    fetcher,
  );
  await source.read();
  expect(fetcher).toHaveBeenCalledOnce();
  expect(source.names()).toEqual(['alice']);
  await expect(source.read()).rejects.toThrow(/Wait/);
  context = { ...context, auth: { ...auth, userID: '43' } };
  expect(source.names()).toEqual([]);
  context = { ...context, auth, channel: 'other' };
  expect(source.names()).toEqual([]);
});
it('discards a delayed page after account change and never treats wrong-account names as completions', async () => {
  let context = { auth, channel: 'room', viewers: 10 };
  let finish: ((r: Response) => void) | undefined;
  setCompletionPreferences({ ...completionDefaults, fetchChatters: true });
  source = new CompletionChatters(
    () => context,
    () => {},
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  const request = source.read();
  context = { ...context, auth: { ...auth, userID: '43' } };
  finish!(new Response(JSON.stringify(page)));
  await expect(request).rejects.toThrow(/changed/);
  expect(source.names()).toEqual([]);
});
it('expires ephemeral names and suppresses them immediately when consent or privacy changes', async () => {
  vi.useFakeTimers();
  let context = { auth, channel: 'room', viewers: 10 };
  setCompletionPreferences({ ...completionDefaults, fetchChatters: true });
  source = new CompletionChatters(
    () => context,
    () => {},
    async () => new Response(JSON.stringify(page)),
  );
  await source.read();
  context = { ...context, auth: { ...auth, chattersEnabled: false } };
  expect(source.names()).toEqual([]);
  context = { ...context, auth };
  expect(source.names()).toEqual(['alice']);
  vi.advanceTimersByTime(300001);
  expect(source.names()).toEqual([]);
});
it('clears private cached names when streamer privacy activates', async () => {
  setCompletionPreferences({ ...completionDefaults, fetchChatters: true });
  source = new CompletionChatters(
    () => ({ auth, channel: 'room', viewers: 10 }),
    () => {},
    async () => new Response(JSON.stringify(page)),
  );
  await source.read();
  localStorage.setItem('chatthing:v1:privacy', JSON.stringify({ version: 1, enabled: true, allowed: [], panic: true }));
  document.dispatchEvent(new Event('privacychange'));
  expect(source.names()).toEqual([]);
  localStorage.removeItem('chatthing:v1:privacy');
  expect(source.names()).toEqual([]);
});
