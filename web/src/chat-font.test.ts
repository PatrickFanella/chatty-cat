// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableCSSFileLoading":true,"handleDisabledFileLoadingAsSuccess":true}}
import { afterEach, expect, it, vi } from 'vitest';
import { DisplayRuntime } from './display';
import { loadChatFont } from './chat-font';

let runtime: DisplayRuntime | undefined;
afterEach(() => {
  runtime?.stop();
  runtime = undefined;
  document.querySelectorAll('link[data-chat-font]').forEach((link) => link.remove());
  document.body.replaceChildren();
  localStorage.clear();
  vi.unstubAllGlobals();
});

// The runtime loads the font; the Settings window's Font row writes through setOptions.
function start(): DisplayRuntime {
  vi.stubGlobal('matchMedia', () => Object.assign(new EventTarget(), { matches: false }));
  runtime?.stop();
  runtime = new DisplayRuntime(vi.fn());
  return runtime;
}
const choose = (font: string): void => runtime!.setOptions({ ...runtime!.options, font });

it('makes no Google stylesheet request for the default or system font', () => {
  start();
  expect(document.querySelector('link[data-chat-font]')).toBeNull();
  choose('sans');
  expect(document.querySelector('link[data-chat-font]')).toBeNull();
});

it('loads the selected family synchronously, replaces it and restores it from saved settings', () => {
  start();
  choose('firacode');
  const link = document.querySelector<HTMLLinkElement>('link[data-chat-font]')!;
  expect(link.href).toBe('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;600&display=swap');
  runtime!.toggleTone();
  expect(document.querySelector('link[data-chat-font]')).toBe(link);
  choose('atkinsonmono');
  expect(document.querySelectorAll('link[data-chat-font]')).toHaveLength(1);
  expect(document.querySelector<HTMLLinkElement>('link[data-chat-font]')!.href).toContain(
    'family=Atkinson+Hyperlegible+Mono:wght@400;600&display=swap',
  );
  document.querySelector('link[data-chat-font]')!.remove();
  expect(start().options.font).toBe('atkinsonmono');
  expect(document.querySelector<HTMLLinkElement>('link[data-chat-font]')!.href).toContain(
    'family=Atkinson+Hyperlegible+Mono:',
  );
  runtime!.setOptions({ font: 'roobert' });
  expect(document.querySelector('link[data-chat-font]')).toBeNull();
});

it('never constructs a stylesheet URL from an unsupported font', () => {
  for (const font of ['sans', 'fixedsys', 'toString', '__proto__', 'Inter&family=Unselected']) {
    loadChatFont(font);
    expect(document.querySelector('link[data-chat-font]')).toBeNull();
  }
});
