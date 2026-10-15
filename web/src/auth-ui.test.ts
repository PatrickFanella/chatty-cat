// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { mountAuth } from './auth';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  history.replaceState(null, '', '/');
});
it('renders account and signs out with CSRF', async () => {
  vi.useFakeTimers();
  const button = document.createElement('button');
  const label = document.createElement('span');
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        enabled: true,
        authenticated: true,
        loginURL: 'https://chat.subcult.tv/api/auth/login',
        login: 'viewer',
        userID: '42',
        csrf: 'csrf',
      }),
    })
    .mockResolvedValueOnce({ ok: true })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ enabled: true, authenticated: false, loginURL: 'https://chat.subcult.tv/api/auth/login' }),
    });
  vi.stubGlobal('fetch', fetcher);
  const stop = mountAuth(button, label);
  await vi.advanceTimersByTimeAsync(0);
  expect(button.textContent).toBe('Sign out');
  expect(label.textContent).toBe('Signed in as viewer');
  button.click();
  await vi.advanceTimersByTimeAsync(0);
  expect(button.textContent).toBe('Log in with Twitch');
  expect(fetcher.mock.calls[1]?.[1]).toMatchObject({ method: 'POST', headers: { 'X-CSRF-Token': 'csrf' } });
  stop();
  await vi.advanceTimersByTimeAsync(60000);
  expect(fetcher).toHaveBeenCalledTimes(3);
});
it('keeps consent cancellation visible and removes its query', async () => {
  vi.useFakeTimers();
  history.replaceState(null, '', '/?channel=hasanabi&auth=denied');
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enabled: true, authenticated: false, loginURL: 'https://chat.subcult.tv/api/auth/login' }),
    }),
  );
  const button = document.createElement('button');
  const label = document.createElement('span');
  const stop = mountAuth(button, label);
  await vi.advanceTimersByTimeAsync(0);
  expect(label.textContent).toBe('Twitch login was cancelled');
  expect(location.search).toBe('?channel=hasanabi');
  stop();
});
