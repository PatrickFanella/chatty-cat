// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableCSSFileLoading":true,"handleDisabledFileLoadingAsSuccess":true}}
import { afterEach, expect, it, vi } from 'vitest';
import { DisplaySettings } from './display';
import { loadChatFont } from './chat-font';

let settings: DisplaySettings | undefined;
afterEach(() => {
  settings?.stop();
  settings = undefined;
  document.querySelectorAll('link[data-chat-font]').forEach((link) => link.remove());
  document.body.replaceChildren();
  localStorage.clear();
  vi.unstubAllGlobals();
});

function mount(): HTMLSelectElement {
  vi.stubGlobal('matchMedia', () => Object.assign(new EventTarget(), { matches: false }));
  const dialog = document.createElement('dialog');
  dialog.innerHTML = '<form><select name="font"></select></form>';
  const trigger = document.createElement('button');
  document.body.append(dialog, trigger);
  settings = new DisplaySettings(dialog, trigger, vi.fn());
  return dialog.querySelector('select')!;
}

it('makes no Google stylesheet request for the default or system font', () => {
  const font = mount();
  expect(document.querySelector('link[data-chat-font]')).toBeNull();
  font.value = 'sans';
  font.dispatchEvent(new Event('change', { bubbles: true }));
  expect(document.querySelector('link[data-chat-font]')).toBeNull();
});

it('loads the selected family synchronously, replaces it and restores it from saved settings', () => {
  const font = mount();
  font.value = 'firacode';
  font.dispatchEvent(new Event('change', { bubbles: true }));
  const link = document.querySelector<HTMLLinkElement>('link[data-chat-font]')!;
  expect(link.href).toBe('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;600&display=swap');
  settings!.toggleTone();
  expect(document.querySelector('link[data-chat-font]')).toBe(link);
  font.value = 'atkinsonmono';
  font.dispatchEvent(new Event('change', { bubbles: true }));
  expect(document.querySelectorAll('link[data-chat-font]')).toHaveLength(1);
  expect(document.querySelector<HTMLLinkElement>('link[data-chat-font]')!.href).toContain(
    'family=Atkinson+Hyperlegible+Mono:wght@400;600&display=swap',
  );
  settings!.stop();
  document.body.replaceChildren();
  document.querySelector('link[data-chat-font]')!.remove();
  expect(mount().value).toBe('atkinsonmono');
  expect(document.querySelector<HTMLLinkElement>('link[data-chat-font]')!.href).toContain(
    'family=Atkinson+Hyperlegible+Mono:',
  );
  settings!.setOptions({ font: 'roobert' });
  expect(document.querySelector('link[data-chat-font]')).toBeNull();
});

it('never constructs a stylesheet URL from an unsupported font', () => {
  for (const font of ['sans', 'fixedsys', 'toString', '__proto__', 'Inter&family=Unselected']) {
    loadChatFont(font);
    expect(document.querySelector('link[data-chat-font]')).toBeNull();
  }
});
