import { describe, expect, it, vi, afterEach } from 'vitest';
import { loadAuth, logout, parseAuthStatus } from './auth';

afterEach(() => vi.unstubAllGlobals());
describe('auth boundary', () => {
  const anonymous = { enabled: true, authenticated: false, loginURL: 'https://chat.subcult.tv/api/auth/login' };
  it('accepts anonymous and authenticated sessions', () => {
    expect(parseAuthStatus(anonymous)).toEqual(anonymous);
    expect(parseAuthStatus({ ...anonymous, authenticated: true, login: 'user', userID: '42', csrf: 'opaque' }).login).toBe('user');
  });
  it.each([null, {}, { ...anonymous, authenticated: 'yes' }, { ...anonymous, authenticated: true },
    { ...anonymous, loginURL: 'javascript:alert(1)' }, { ...anonymous, loginURL: 'http://chat.subcult.tv/api/auth/login' },
    { ...anonymous, loginURL: 'https://secret@chat.subcult.tv/api/auth/login' },
    { ...anonymous, loginURL: 'https://chat.subcult.tv/api/auth/login?next=evil' },
  ])('rejects invalid auth data %j', (data) => expect(() => parseAuthStatus(data)).toThrow());
  it('permits a registered loopback origin', () => expect(parseAuthStatus({ ...anonymous, loginURL: 'http://127.0.0.1:8080/api/auth/login' }).enabled).toBe(true));
  it('ignores server extras such as tokens', () => expect(parseAuthStatus({ ...anonymous, access_token: 'secret' })).not.toHaveProperty('access_token'));
  it('loads same-origin session and posts CSRF on logout', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => anonymous }).mockResolvedValueOnce({ ok: true });
    vi.stubGlobal('fetch', fetcher);
    expect(await loadAuth()).toEqual(anonymous);
    await logout('csrf');
    expect(fetcher.mock.calls[1]).toEqual(['/api/auth/logout', expect.objectContaining({ method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': 'csrf' } })]);
  });
  it('reports session and logout failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    await expect(loadAuth()).rejects.toThrow('unavailable');
    await expect(logout('csrf')).rejects.toThrow('Could not sign out');
  });
});
