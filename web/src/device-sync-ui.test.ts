// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { DeviceSyncPanel } from './device-sync-ui';
import { setProfileScope, profileKey } from './account-profiles';
import { savePrivacy, resetPrivacyFallback } from './privacy';
const auth = {
  enabled: true,
  authenticated: true,
  loginURL: 'https://chat.subcult.tv/api/auth/login',
  userID: '42',
  login: 'alice',
  csrf: 'opaque',
};
let panel: DeviceSyncPanel | undefined;
afterEach(() => {
  panel?.stop();
  panel = undefined;
  document.body.replaceChildren();
  localStorage.clear();
  resetPrivacyFallback();
  setProfileScope('anonymous');
  vi.unstubAllGlobals();
});
function button(text: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')].find((b) => b.textContent === text);
  if (!found) throw new Error('Missing button ' + text);
  return found;
}
it('requires review and confirmation to clear a private backup, and rejects stale review', () => {
  setProfileScope('42');
  document.body.innerHTML = '<button id="commands-open"></button>';
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  panel = new DeviceSyncPanel(
    () => auth,
    () => {
      throw new Error('No public data needed');
    },
    () => true,
    () => {},
  );
  const key = profileKey('chatthing:v1:sync-annotation-backup');
  localStorage.setItem(key, 'private original');
  button('Device sync').click();
  button('Review clear private annotation backup').click();
  expect(localStorage.getItem(key)).toBe('private original');
  expect(document.querySelector('textarea')?.value).toBe('');
  localStorage.setItem(key, 'private newer');
  button('Confirm reviewed sync action').click();
  expect(localStorage.getItem(key)).toBe('private newer');
  button('Review clear private annotation backup').click();
  button('Confirm reviewed sync action').click();
  expect(localStorage.getItem(key)).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});
it('clears a pending review on privacy and does not reconnect when reopened', () => {
  setProfileScope('42');
  document.body.innerHTML = '<button id="commands-open"></button>';
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  panel = new DeviceSyncPanel(
    () => auth,
    () => {
      throw new Error('No public data needed');
    },
    () => true,
    () => {},
  );
  localStorage.setItem(profileKey('chatthing:v1:sync-annotation-backup'), 'private');
  button('Device sync').click();
  button('Review clear private annotation backup').click();
  expect(button('Confirm reviewed sync action').disabled).toBe(false);
  savePrivacy({ version: 1, enabled: true, allowed: [], panic: true });
  document.dispatchEvent(new Event('privacychange'));
  expect(panel.root.open).toBe(false);
  expect(button('Confirm reviewed sync action').disabled).toBe(true);
  expect(panel.root.querySelector('textarea')?.value).toBe('');
  expect(fetcher).not.toHaveBeenCalled();
});
