// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ChatterinoImportPanel } from './chatterino-import-ui';
import { WorkspaceStore, parseSnapshot } from './workspaces';
import { defaultDisplay } from './display';
import { setProfileScope } from './account-profiles';
let panel: ChatterinoImportPanel | undefined;
beforeEach(() => {
  localStorage.clear();
  setProfileScope('123');
});
afterEach(() => {
  panel?.stop();
  document.body.replaceChildren();
  setProfileScope('anonymous');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function setup() {
  const store = new WorkspaceStore(),
    current = parseSnapshot({
      channels: ['current'],
      target: 'current',
      focus: 'log',
      settings: { version: 1, display: defaultDisplay(), extras: {} },
      readers: [],
    });
  store.create('Original', current);
  panel = new ChatterinoImportPanel(store, () => current);
  const source = panel.root.querySelector<HTMLTextAreaElement>('[aria-label="Chatterino settings JSON"]')!;
  source.value = '{"appearance":{"messages":{"showTimestamps":false}},"accounts":{"token":"SECRET"}}';
  const click = (name: string) => {
    const button = [...panel!.root.querySelectorAll('button')].find((b) => b.textContent === name);
    expect(button).toBeDefined();
    button!.click();
  };
  return { store, current, source, click };
}
it('reviews without writing and atomically adds copies with a sanitized recovery preview', () => {
  const { store, source, click } = setup(),
    before = localStorage.getItem('chatthing:v1:profile:123:workspaces');
  click('Review Chatterino import');
  expect(localStorage.getItem('chatthing:v1:profile:123:workspaces')).toBe(before);
  expect(panel!.root.textContent).toContain('Original');
  expect(panel!.root.textContent).not.toContain('SECRET');
  click('Preview recovery export');
  expect(panel!.root.querySelector('[aria-label="Workspace recovery preview"]')?.textContent).toContain('Original');
  click('Save imported workspace copies');
  expect(store.all()).toHaveLength(2);
  expect(store.all()[0]?.name).toBe('Original');
  expect(localStorage.getItem('chatthing:v1:profile:123:workspaces')).not.toContain('SECRET');
  expect(source.value).toBe('');
});
it('invalidates reviews on edits, current changes and account changes', () => {
  const { store, current, source, click } = setup();
  click('Review Chatterino import');
  source.dispatchEvent(new Event('input', { bubbles: true }));
  click('Save imported workspace copies');
  expect(store.all()).toHaveLength(1);
  click('Review Chatterino import');
  current.settings.display.size = 18;
  click('Save imported workspace copies');
  expect(store.all()).toHaveLength(1);
  expect(panel!.root.textContent).toContain('changed');
  click('Review Chatterino import');
  setProfileScope('456');
  click('Save imported workspace copies');
  expect(localStorage.getItem('chatthing:v1:profile:456:workspaces')).toBeNull();
  expect(panel!.root.textContent).toContain('Account changed');
});
it('refuses quota failure without partial workspace changes', () => {
  const { store, click } = setup();
  click('Review Chatterino import');
  const storage = localStorage,
    original = storage.getItem('chatthing:v1:profile:123:workspaces');
  vi.stubGlobal('localStorage', {
    getItem: storage.getItem.bind(storage),
    setItem: () => {
      throw new Error('quota');
    },
  });
  click('Save imported workspace copies');
  expect(store.all()).toHaveLength(1);
  expect(storage.getItem('chatthing:v1:profile:123:workspaces')).toBe(original);
  expect(panel!.root.textContent).toContain('Could not save');
});
it('preserves an external workspace edit and refuses to save a stale review', () => {
  const { store, click } = setup();
  click('Review Chatterino import');
  const key = 'chatthing:v1:profile:123:workspaces',
    raw = localStorage.getItem(key)!;
  localStorage.setItem(key, raw + ' ');
  click('Save imported workspace copies');
  expect(store.all()).toHaveLength(1);
  expect(localStorage.getItem(key)).toBe(raw + ' ');
  expect(panel!.root.textContent).toContain('changed in another tab');
});
it('clears source and recovery data on close and streamer privacy', () => {
  const { source, click } = setup();
  click('Review Chatterino import');
  click('Preview recovery export');
  localStorage.setItem('chatthing:v1:privacy', JSON.stringify({ version: 1, enabled: true, allowed: [], panic: true }));
  document.dispatchEvent(new Event('privacychange'));
  expect(source.value).toBe('');
  expect(panel!.root.querySelector('[aria-label="Workspace recovery preview"]')?.textContent).toBe('');
});
