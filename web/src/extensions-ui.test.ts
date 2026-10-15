// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { ExtensionsPanel } from './extensions-ui';
import { ExtensionStore, parseExtension } from './extensions';
import { setProfileScope } from './account-profiles';
import { resetPrivacyFallback, savePrivacy } from './privacy';
const auth = {
  enabled: true,
  authenticated: true,
  loginURL: 'https://chat.subcult.tv/api/auth/login',
  userID: '42',
  login: 'alice',
  csrf: 'opaque',
};
const manifest = parseExtension({
  format: 'chatty-cat-extension',
  version: 1,
  id: 'note',
  name: 'Note',
  permissions: ['context:channel'],
  commands: [{ id: 'one', title: 'One', template: '#{{channel}}' }],
  views: [],
});
let panel: ExtensionsPanel | undefined;
afterEach(() => {
  panel?.stop();
  panel = undefined;
  localStorage.clear();
  document.body.replaceChildren();
  setProfileScope('anonymous');
  resetPrivacyFallback();
});
function b(text: string): HTMLButtonElement {
  const b = [...document.querySelectorAll('button')].find((b) => b.textContent === text);
  if (!b) throw new Error(text);
  return b;
}
it('install stays disabled until separate permission confirmation; disable clears that review', () => {
  setProfileScope('42');
  const store = new ExtensionStore('42');
  store.install(manifest);
  document.body.innerHTML = '<button id="commands-open"></button>';
  panel = new ExtensionsPanel(
    () => auth,
    () => 'one',
    vi.fn(),
  );
  b('Web extensions').click();
  expect(panel.actions()).toEqual([]);
  b('Review enable permissions').click();
  expect(new ExtensionStore('42').all()[0]?.enabled).toBe(false);
  b('Disable selected extension now').click();
  expect(b('Confirm reviewed extension change').disabled).toBe(true);
  b('Review enable permissions').click();
  b('Confirm reviewed extension change').click();
  expect(document.querySelector('[role="status"]')?.textContent).toBe('Reviewed extension change saved');
  expect(panel.actions()).toHaveLength(1);
  expect(new ExtensionStore('42').all()[0]?.enabled).toBe(true);
});
it('privacy clears private supplied input, review/output and active frames', () => {
  setProfileScope('42');
  const store = new ExtensionStore('42');
  store.install(manifest);
  store.enable('note', true);
  document.body.innerHTML = '<button id="commands-open"></button>';
  panel = new ExtensionsPanel(
    () => auth,
    () => 'one',
    vi.fn(),
  );
  b('Web extensions').click();
  (document.querySelector('[aria-label="Text explicitly supplied to extension"]') as HTMLTextAreaElement).value =
    'private local note';
  b('Run selected extension command/view').click();
  expect(document.querySelector('iframe')).not.toBeNull();
  savePrivacy({ version: 1, enabled: true, allowed: [], panic: true });
  document.dispatchEvent(new Event('privacychange'));
  expect(document.querySelector('iframe')).toBeNull();
  expect(panel.root.open).toBe(false);
  expect(
    (document.querySelector('[aria-label="Text explicitly supplied to extension"]') as HTMLTextAreaElement).value,
  ).toBe('');
  expect((document.querySelector('[aria-label="Plain extension output"]') as HTMLTextAreaElement).value).toBe('');
});
