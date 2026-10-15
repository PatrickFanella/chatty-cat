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
  document.body.replaceChildren();
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
  panel.open();
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
  document.body.replaceChildren();
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
  panel.open();
  button('Review clear private annotation backup').click();
  expect(button('Confirm reviewed sync action').disabled).toBe(false);
  savePrivacy({ version: 1, enabled: true, allowed: [], panic: true });
  document.dispatchEvent(new Event('privacychange'));
  expect(panel.root.open).toBe(false);
  expect(button('Confirm reviewed sync action').disabled).toBe(true);
  expect(panel.root.querySelector('textarea')?.value).toBe('');
  expect(fetcher).not.toHaveBeenCalled();
});

it('opens and restores the recovery notice without reading public data or making a sync request', () => {
  const fetcher = vi.fn(),
    local = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  panel = new DeviceSyncPanel(
    () => auth,
    local,
    () => true,
    () => {},
    false,
    'Synthetic recovery result',
  );
  expect(local).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
  expect(panel.root.id).toBe('device-sync-panel');
  panel.open();
  expect(panel.root.textContent).toContain('Synthetic recovery result');
  panel.close();
  panel.open();
  expect(panel.root.textContent).toContain('Synthetic recovery result');
  expect(button('Confirm reviewed sync action').disabled).toBe(true);
  expect(local).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
});
it('aborts an explicit pending connection on close and does not reconnect on reopen', async () => {
  setProfileScope('42');
  let resolve: ((value: Response) => void) | undefined;
  let signal: AbortSignal | undefined;
  const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    signal = init?.signal ?? undefined;
    return new Promise<Response>((finish) => {
      resolve = finish;
    });
  });
  vi.stubGlobal('fetch', fetcher);
  panel = new DeviceSyncPanel(
    () => auth,
    vi.fn(),
    () => true,
    () => {},
  );
  panel.open();
  button('Connect / fetch current revision').click();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(signal?.aborted).toBe(false);
  panel.close();
  expect(signal?.aborted).toBe(true);
  resolve?.(new Response(JSON.stringify({ enabled: true, maxBytes: 2 * 1024 * 1024 })));
  await new Promise((finish) => setTimeout(finish, 0));
  expect(fetcher).toHaveBeenCalledTimes(1);
  panel.open();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(button('Confirm reviewed sync action').disabled).toBe(true);
  expect(panel.root.querySelector('textarea')?.value).toBe('');
});
