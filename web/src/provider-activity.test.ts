// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { intervalSnapshot, deadlineSnapshot } from './resource-timers';
import { ProviderActivity } from './provider-activity';
import { providerDefaults, setProviderPreferences } from './provider-preferences';
import { setProfileScope } from './account-profiles';
import type { AuthStatus } from './auth';
let activity: ProviderActivity | undefined;
const auth: AuthStatus = {
  enabled: true,
  authenticated: true,
  loginURL: 'http://localhost/api/auth/login',
  userID: '42',
  login: 'fixture',
  csrf: 'fixture',
};
afterEach(() => {
  activity?.dispose();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setProfileScope('anonymous');
  setProviderPreferences(providerDefaults());
  localStorage.clear();
});
function setup() {
  vi.useFakeTimers();
  setProfileScope('42');
  let current: AuthStatus | undefined = auth,
    channel = { channel: 'room', broadcasterID: '99' };
  const bttv = vi.fn(() => true),
    status = vi.fn();
  const fetcher = vi.fn(async (url: string) => {
    if (url === '/api/auth/session') return new Response(JSON.stringify(auth));
    if (url === '/api/provider-services/config')
      return new Response(
        JSON.stringify({ providers: ['BTTV', '7TV'], maxChannels: 24, maxSockets: 3, refreshSeconds: 30 }),
      );
    if (url.includes('/users/twitch/'))
      return new Response(JSON.stringify({ id: '42', platform: 'TWITCH', user: { id: 'own7tv' } }));
    if (url === 'https://7tv.io/v3/users/own7tv/presences') return new Response(null, { status: 204 });
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal('fetch', fetcher);
  activity = new ProviderActivity(
    () => current,
    () => channel,
    bttv,
    status,
  );
  const p = providerDefaults();
  p.activity.BTTV = true;
  p.activity['7TV'] = true;
  setProviderPreferences(p);
  return {
    fetcher,
    bttv,
    status,
    account: (a: AuthStatus | undefined) => {
      current = a;
    },
    channel: (name: string) => {
      channel = { ...channel, channel: name };
    },
  };
}
it('requires reviewed opt-ins and a fresh own account before one bounded recurring announcement', async () => {
  const { fetcher, bttv } = setup();
  expect(fetcher).not.toHaveBeenCalled();
  await expect(activity!.start()).rejects.toThrow('Review');
  const review = await activity!.review();
  expect(review).toContain('fixture');
  expect(review).toContain('#room');
  expect(bttv).not.toHaveBeenCalled();
  expect(fetcher.mock.calls.every((c) => !String(c[0]).endsWith('/presences'))).toBe(true);
  await activity!.start();
  expect(bttv).toHaveBeenCalledExactlyOnceWith(auth, '99');
  const writes = () => fetcher.mock.calls.filter((c) => String(c[0]).endsWith('/presences'));
  expect(writes()).toHaveLength(1);
  expect(activity!.running).toBe(true);
  await vi.advanceTimersByTimeAsync(300000);
  expect(writes()).toHaveLength(2);
  expect(bttv).toHaveBeenCalledTimes(2);
});
it('stops on channel/account/privacy change without sending a new target or automatic resume', async () => {
  const { channel, bttv } = setup();
  await activity!.review();
  await activity!.start();
  channel('other');
  await vi.advanceTimersByTimeAsync(1000);
  expect(activity!.running).toBe(false);
  await vi.advanceTimersByTimeAsync(300000);
  expect(bttv).toHaveBeenCalledOnce();
  localStorage.setItem('chatthing:v1:privacy', JSON.stringify({ version: 1, enabled: true, allowed: [], panic: true }));
  document.dispatchEvent(new Event('privacychange'));
  await expect(activity!.review()).rejects.toThrow();
});
it('invalidates review on preference edits, expiry and changed authentication', async () => {
  const { account, bttv } = setup();
  await activity!.review();
  account({ ...auth, csrf: 'renewed' });
  await expect(activity!.start()).rejects.toThrow();
  expect(bttv).not.toHaveBeenCalled();
  account(auth);
  await activity!.review();
  await vi.advanceTimersByTimeAsync(61000);
  await expect(activity!.start()).rejects.toThrow();
});
it('does not retry an ambiguous presence failure and retains the five-minute attempt limit across stop', async () => {
  const { fetcher, bttv } = setup();
  await activity!.review();
  fetcher.mockImplementation(async (url: string) =>
    url.endsWith('/presences')
      ? Promise.reject(new Error('lost response'))
      : new Response(
          JSON.stringify(
            url === '/api/auth/session'
              ? auth
              : { providers: ['BTTV', '7TV'], maxChannels: 24, maxSockets: 3, refreshSeconds: 30 },
          ),
        ),
  );
  await expect(activity!.start()).rejects.toThrow();
  expect(bttv).toHaveBeenCalledOnce();
  expect(activity!.running).toBe(false);
  activity!.cancel();
  await expect(activity!.review()).rejects.toThrow('five minutes');
  await vi.advanceTimersByTimeAsync(300000);
  expect(bttv).toHaveBeenCalledOnce();
});
it('rejects unlinked or mismatched provider users and disabled operator capabilities before writes', async () => {
  const { fetcher, bttv } = setup();
  fetcher.mockImplementation(
    async (url: string) =>
      new Response(
        JSON.stringify(
          url === '/api/auth/session'
            ? auth
            : url.includes('/users/twitch/')
              ? { id: '43', platform: 'TWITCH', user: { id: 'other' } }
              : { providers: ['BTTV', '7TV'], maxChannels: 24, maxSockets: 3, refreshSeconds: 30 },
        ),
      ),
  );
  await expect(activity!.review()).rejects.toThrow('linked');
  expect(bttv).not.toHaveBeenCalled();
  fetcher.mockImplementation(
    async (url: string) =>
      new Response(
        JSON.stringify(
          url === '/api/auth/session' ? auth : { providers: [], maxChannels: 24, maxSockets: 3, refreshSeconds: 30 },
        ),
      ),
  );
  await expect(activity!.review()).rejects.toThrow('configured');
  expect(bttv).not.toHaveBeenCalled();
});
it('aborts a pending write on privacy and never arms from its late response', async () => {
  const { fetcher } = setup();
  await activity!.review();
  const original = fetcher.getMockImplementation()!;
  let finish: (r: Response) => void = () => {},
    signal: AbortSignal | undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, options?: RequestInit) =>
      url.endsWith('/presences')
        ? new Promise<Response>((resolve) => {
            finish = resolve;
            signal = options?.signal ?? undefined;
          })
        : original(url),
    ),
  );
  const start = activity!.start();
  await vi.advanceTimersByTimeAsync(1);
  expect(signal?.aborted).toBe(false);
  localStorage.setItem('chatthing:v1:privacy', JSON.stringify({ version: 1, enabled: true, allowed: [], panic: true }));
  document.dispatchEvent(new Event('privacychange'));
  expect(signal?.aborted).toBe(true);
  finish(new Response(null, { status: 204 }));
  await expect(start).rejects.toThrow();
  expect(activity!.running).toBe(false);
});

it('keeps a reviewed hidden session on its send deadline without a repeating background poll', async () => {
  const { bttv } = setup();
  let hidden = false;
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  await activity!.review();
  await activity!.start();
  expect(bttv).toHaveBeenCalledOnce();
  hidden = true;
  document.dispatchEvent(new Event('visibilitychange'));
  expect(intervalSnapshot()).toEqual([]);
  expect(deadlineSnapshot()).toEqual([{ owner: 'provider.reviewed-activity', dueInMs: 300000 }]);
  await vi.advanceTimersByTimeAsync(299999);
  expect(bttv).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1);
  expect(bttv).toHaveBeenCalledTimes(2);
  expect(intervalSnapshot()).toEqual([]);
  activity!.cancel();
  expect(deadlineSnapshot()).toEqual([]);
  await vi.advanceTimersByTimeAsync(600000);
  expect(bttv).toHaveBeenCalledTimes(2);
});
