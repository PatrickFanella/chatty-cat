// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { CustomThemePanel } from './custom-theme-ui';
import { setProfileScope } from './account-profiles';
const theme = {
  version: 1,
  name: 'Night',
  colors: {
    background: '#101010',
    panel: '#202020',
    foreground: '#ffffff',
    muted: '#bbbbbb',
    border: '#888888',
    accent: '#99ddff',
  },
};
let panel: CustomThemePanel | undefined;
afterEach(() => {
  panel?.stop();
  panel = undefined;
  vi.unstubAllGlobals();
  localStorage.clear();
  setProfileScope('anonymous');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});
function setup() {
  document.body.innerHTML = '<button id="display-open"></button><input id="message" value="unsent draft">';
  panel = new CustomThemePanel();
  const input = panel.root.querySelector('textarea')!;
  input.value = JSON.stringify(theme);
  return {
    input,
    click: (label: string) => [...panel!.root.querySelectorAll('button')].find((b) => b.textContent === label)!.click(),
  };
}
it('previews colors without storage or draft changes, then restores the palette on close', () => {
  const { click } = setup();
  click('Review theme');
  click('Preview across workspace');
  expect(document.documentElement.style.getPropertyValue('--bg')).toBe('#101010');
  expect(localStorage.length).toBe(0);
  panel!.root.dispatchEvent(new Event('close'));
  expect(document.documentElement.style.getPropertyValue('--bg')).toBe('');
  expect(document.querySelector<HTMLInputElement>('#message')!.value).toBe('unsent draft');
});
it('saves only validated data and keeps the applied view on failed or stale storage writes', () => {
  const { click } = setup();
  click('Review theme');
  click('Apply and save theme');
  const raw = localStorage.getItem('chatthing:v1:custom-theme');
  expect(raw).toContain('Night');
  localStorage.setItem('chatthing:v1:custom-theme', 'null');
  click('Use built-in palette');
  expect(document.documentElement.style.getPropertyValue('--bg')).toBe('#101010');
  expect(panel!.root.textContent).toContain('changed in another tab');
});
it('blocks cross-account saves and invalidates review when the source changes', () => {
  setProfileScope('123');
  const { input, click } = setup();
  click('Review theme');
  input.value = '{}';
  input.dispatchEvent(new Event('input'));
  click('Apply and save theme');
  expect(localStorage.length).toBe(0);
  input.value = JSON.stringify(theme);
  click('Review theme');
  setProfileScope('456');
  click('Apply and save theme');
  expect(localStorage.length).toBe(0);
  expect(panel!.root.textContent).toContain('Account changed');
});
it('refuses quota failure without replacing the saved theme', () => {
  const { click } = setup();
  click('Review theme');
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => {
      throw new Error('Quota full');
    },
  });
  click('Apply and save theme');
  expect(document.documentElement.style.getPropertyValue('--bg')).toBe('');
  expect(panel!.root.textContent).toContain('Quota full');
});
it('restores only the current account theme and blocks malformed saved data from overwrite', () => {
  setProfileScope('123');
  const { click } = setup();
  click('Review theme');
  click('Apply and save theme');
  panel!.stop();
  setProfileScope('456');
  panel = new CustomThemePanel();
  expect(document.documentElement.style.getPropertyValue('--bg')).toBe('');
  panel.stop();
  setProfileScope('123');
  panel = new CustomThemePanel();
  expect(document.documentElement.style.getPropertyValue('--bg')).toBe('#101010');
  panel.stop();
  localStorage.setItem('chatthing:v1:profile:123:custom-theme', '{"version":99}');
  panel = new CustomThemePanel();
  const input = panel.root.querySelector('textarea')!;
  input.value = JSON.stringify(theme);
  click('Review theme');
  click('Apply and save theme');
  expect(localStorage.getItem('chatthing:v1:profile:123:custom-theme')).toBe('{"version":99}');
});
it('clears private import text and motion preview when privacy activates', () => {
  const { input, click } = setup();
  click('Review theme');
  click('Preview across workspace');
  const motion = panel!.root.querySelector<HTMLInputElement>('input[type=checkbox]')!;
  motion.checked = true;
  motion.dispatchEvent(new Event('change'));
  localStorage.setItem('chatthing:v1:privacy', JSON.stringify({ version: 1, enabled: true, allowed: [], panic: true }));
  document.dispatchEvent(new Event('privacychange'));
  expect(input.value).toBe('');
  expect(document.documentElement.style.getPropertyValue('--bg')).toBe('');
  expect(document.documentElement.hasAttribute('data-theme-reduced-motion')).toBe(false);
});
it('does not schedule a reader repaint after the theme panel stops', () => {
  setup();
  const changed = vi.fn();
  document.addEventListener('customthemechange', changed);
  panel!.stop();
  expect(changed).not.toHaveBeenCalled();
  document.removeEventListener('customthemechange', changed);
});
