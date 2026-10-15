// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { CustomThemeRuntime } from './custom-theme-runtime';
import { setProfileScope } from './account-profiles';
const theme = {
  version: 1 as const,
  name: 'Saved fixture',
  colors: {
    background: '#101010',
    panel: '#202020',
    foreground: '#ffffff',
    muted: '#bbbbbb',
    border: '#888888',
    accent: '#99ddff',
  },
};
const key = 'chatthing:v1:custom-theme';
let runtime: CustomThemeRuntime | undefined;
afterEach(() => {
  runtime?.stop();
  runtime = undefined;
  localStorage.clear();
  setProfileScope('anonymous');
  document.documentElement.removeAttribute('style');
  vi.restoreAllMocks();
});
function remote(raw: string | null): void {
  if (raw === null) localStorage.removeItem(key);
  else localStorage.setItem(key, raw);
  window.dispatchEvent(new StorageEvent('storage', { key, newValue: raw }));
}
it('applies saved colors and cross-tab changes without constructing editor DOM', () => {
  localStorage.setItem(key, JSON.stringify(theme));
  runtime = new CustomThemeRuntime();
  expect(document.documentElement.style.getPropertyValue('--bg')).toBe('#101010');
  expect(document.querySelector('#custom-theme-panel')).toBeNull();
  remote(JSON.stringify({ ...theme, colors: { ...theme.colors, background: '#303030' } }));
  expect(document.documentElement.style.getPropertyValue('--bg')).toBe('#303030');
  localStorage.clear();
  window.dispatchEvent(new StorageEvent('storage', { key: null }));
  expect(document.documentElement.hasAttribute('data-custom-theme')).toBe(false);
  expect(document.documentElement.style.getPropertyValue('--bg')).toBe('');
});
it('retains valid applied colors on malformed remote data and blocks overwrites', () => {
  localStorage.setItem(key, JSON.stringify(theme));
  runtime = new CustomThemeRuntime();
  remote('{broken');
  expect(document.documentElement.style.getPropertyValue('--bg')).toBe('#101010');
  expect(runtime.error).toContain('Remote theme invalid');
  expect(() => runtime!.persist(null)).toThrow('existing data retained');
  expect(localStorage.getItem(key)).toBe('{broken');
});
it('preserves malformed startup bytes and refuses cross-account writes', () => {
  localStorage.setItem(key, '{broken');
  runtime = new CustomThemeRuntime();
  expect(runtime.saved).toBeNull();
  expect(() => runtime!.persist(theme)).toThrow('existing data retained');
  expect(localStorage.getItem(key)).toBe('{broken');
  setProfileScope('42');
  expect(() => runtime!.reload()).toThrow('Account changed');
  expect(() => runtime!.persist(theme)).toThrow('Account changed');
  expect(localStorage.getItem('chatthing:v1:profile:42:custom-theme')).toBeNull();
});
it('restores the original inline palette silently on stop and ignores later storage events', () => {
  document.documentElement.style.setProperty('--bg', '#090909');
  localStorage.setItem(key, JSON.stringify(theme));
  runtime = new CustomThemeRuntime();
  const changed = vi.fn();
  document.addEventListener('customthemechange', changed);
  runtime.stop();
  remote(JSON.stringify(theme));
  runtime.paint(theme);
  expect(document.documentElement.style.getPropertyValue('--bg')).toBe('#090909');
  expect(changed).not.toHaveBeenCalled();
  document.removeEventListener('customthemechange', changed);
});
