// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { AccountControls } from './account-profiles-ui';
import { AccountProfiles } from './account-profiles';
let panel: AccountControls | undefined;
afterEach(() => {
  panel?.stop();
  document.body.replaceChildren();
  localStorage.clear();
});
const alice = {
  enabled: true,
  authenticated: true,
  loginURL: 'https://chat.subcult.tv/api/auth/login',
  userID: '42',
  login: 'alice',
  csrf: 'fixture',
};
function setup() {
  const anchor = document.createElement('button');
  document.body.append(anchor);
  const change = vi.fn(async (_id: string | undefined) => {});
  panel = new AccountControls(anchor, change);
  panel.setAuth(alice);
  new AccountProfiles().remember('43', 'bob');
  [...document.querySelectorAll('button')].find((b) => b.textContent === 'Accounts')!.click();
  const button = (name: string) => [...panel!.root.querySelectorAll('button')].find((b) => b.textContent === name)!;
  return { change, button };
}
it('switches only by explicit action and forgets saved metadata while preserving account-private storage', async () => {
  const x = setup();
  expect(x.change).not.toHaveBeenCalled();
  x.button('Switch to bob').click();
  await new Promise((r) => setTimeout(r, 0));
  expect(x.change).toHaveBeenCalledWith('43');
  localStorage.setItem('chatthing:v1:bookmarks:43', 'private note');
  x.button('Forget bob').click();
  await new Promise((r) => setTimeout(r, 0));
  expect(new AccountProfiles().list().map((p) => p.id)).toEqual(['42']);
  expect(localStorage.getItem('chatthing:v1:bookmarks:43')).toBe('private note');
});
it('requires logout before forgetting an active identity and suppresses profile names in privacy', async () => {
  const x = setup();
  x.button('Forget alice').click();
  await new Promise((r) => setTimeout(r, 0));
  expect(x.change).toHaveBeenCalledWith('');
  expect(new AccountProfiles().list().map((p) => p.id)).toEqual(['43']);
  localStorage.setItem('chatthing:v1:privacy', JSON.stringify({ version: 1, enabled: true, allowed: [], panic: true }));
  document.dispatchEvent(new Event('privacychange'));
  expect(panel!.root.open).toBe(false);
  expect(panel!.root.textContent).not.toContain('bob');
});
it('opens through the account-selector action without changing identity and removes its listener on stop', () => {
  const x = setup();
  panel!.root.close();
  document.dispatchEvent(new Event('open-account-profiles'));
  expect(panel!.root.open).toBe(true);
  expect(x.change).not.toHaveBeenCalled();
  panel!.stop();
  document.dispatchEvent(new Event('open-account-profiles'));
  expect(document.querySelector('#account-profiles')).toBeNull();
});
