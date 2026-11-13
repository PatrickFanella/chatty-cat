// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { DisplayRuntime, defaultDisplay, displayFromURL } from '../../display';
import type { SettingsHost } from '../host';
import { builtinSections } from './builtin';

let runtime: DisplayRuntime | undefined;
afterEach(() => {
  runtime?.stop();
  runtime = undefined;
  document.body.replaceChildren();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function display(): DisplayRuntime {
  vi.stubGlobal('matchMedia', () => Object.assign(new EventTarget(), { matches: false }));
  runtime = new DisplayRuntime(vi.fn());
  return runtime;
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const section = (host: Partial<SettingsHost>, id: string) =>
  builtinSections(host as SettingsHost).find((s) => s.id === id)!;

it('builtin sections are private', () => {
  expect(builtinSections({} as SettingsHost).every((s) => s.private)).toBe(true);
});

it('builtin alert test shows the attention result', async () => {
  const el = document.createElement('div');
  const test = vi.fn().mockResolvedValue('Alert sent');
  const dispose = await section({ attention: { permission: vi.fn(), test } }, 'builtin.alerts').mount(el);
  el.querySelector('button')!.click();
  await flush();
  expect(el.querySelector('[role=status]')!.textContent).toBe('Alert sent');
  dispose();
  expect(el.children).toHaveLength(0);
});

it('builtin moderation opens the workspace', async () => {
  const el = document.createElement('div');
  const openPanel = vi.fn();
  await section({ openPanel }, 'builtin.moderation').mount(el);
  el.querySelector('button')!.click();
  expect(openPanel).toHaveBeenCalledWith('moderation-workspace');
});

it('builtin provider reload reports throttling', async () => {
  const el = document.createElement('div');
  const reloadProviders = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false);
  const dispose = await section({ reloadProviders, providerStatus: () => 'Events ok' }, 'builtin.providers').mount(el);
  expect(el.textContent).toContain('Events ok');
  const click = () => el.querySelector('button')!.click();
  click();
  expect(el.querySelector('[role=status]')!.textContent).toBe(
    'Reload requested; existing server cache remains in effect.',
  );
  click();
  expect(el.querySelector('[role=status]')!.textContent).toBe('Wait 30 seconds between reload requests.');
  dispose();
  expect(el.children).toHaveLength(0);
});

it('builtin completion chatters reads one page on request', async () => {
  const el = document.createElement('div');
  const readChatters = vi.fn().mockResolvedValue('Read 3 chatters');
  await section({ readChatters, privacy: () => false }, 'builtin.completion-chatters').mount(el);
  expect(readChatters).not.toHaveBeenCalled();
  el.querySelector('button')!.click();
  expect(el.querySelector('[role=status]')!.textContent).toBe('Reading one completion chatter page…');
  await flush();
  expect(readChatters).toHaveBeenCalledOnce();
  expect(el.querySelector('[role=status]')!.textContent).toBe('Read 3 chatters');
  readChatters.mockRejectedValueOnce(new Error('Missing moderator access'));
  el.querySelector('button')!.click();
  await flush();
  expect(el.querySelector('[role=status]')!.textContent).toBe('Missing moderator access');
});

it('builtin providers reconnects optional services', async () => {
  const el = document.createElement('div');
  const reconnectProviders = vi.fn();
  await section({ reloadProviders: vi.fn(), providerStatus: () => '', reconnectProviders }, 'builtin.providers').mount(
    el,
  );
  [...el.querySelectorAll('button')].find((b) => b.textContent === 'Reconnect optional provider services')!.click();
  expect(reconnectProviders).toHaveBeenCalledOnce();
});

const slotButton = (el: HTMLElement, index: number) => el.querySelector<HTMLButtonElement>(`[data-slot="${index}"]`)!;

// Moved from settings-slots.test.ts.
it('saves three validated slots, recalls them and only overwrites deliberately', async () => {
  const runtime = display();
  const el = document.createElement('div');
  await section({ display: runtime }, 'builtin.display-slots').mount(el);
  expect(slotButton(el, 2).textContent).toBe('Slot 3 · empty');
  runtime.setOptions({ ...runtime.options, size: 18 });
  slotButton(el, 0).click();
  expect(slotButton(el, 0).textContent).toContain('saved');
  runtime.setOptions({ ...runtime.options, size: 24 });
  slotButton(el, 0).click();
  expect(runtime.options.size).toBe(18);
  runtime.setOptions({ ...runtime.options, size: 24 });
  slotButton(el, 0).dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true }));
  runtime.setOptions({ ...runtime.options, size: 14 });
  slotButton(el, 0).click();
  expect(runtime.options.size).toBe(24);
  expect(JSON.parse(localStorage.getItem('chatty-cat:v1:display-slots')!)[0].display.size).toBe(24);
  runtime.setOptions({ ...runtime.options, size: 16 });
  slotButton(el, 0).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  expect(JSON.parse(localStorage.getItem('chatty-cat:v1:display-slots')!)[0].display.size).toBe(16);
});

// Moved from settings-slots.test.ts.
it('reads legacy display slots and restores extra state after display recall', async () => {
  const { registerSettings } = await import('../../settings-bundle');
  const runtime = display();
  vi.useFakeTimers();
  localStorage.setItem('chatty-cat:v1:display-slots', JSON.stringify([{ size: 18 }, null, null]));
  const el = document.createElement('div');
  document.body.append(el);
  await section({ display: runtime }, 'builtin.display-slots').mount(el);
  slotButton(el, 0).click();
  expect(runtime.options.size).toBe(18);
  let selected = 'authors';
  const restore = vi.fn((value) => {
    selected = (value as { tab: string }).tab;
  });
  const stop = registerSettings('resources', () => ({ tab: selected }), restore);
  slotButton(el, 1).click();
  selected = 'help';
  slotButton(el, 1).click();
  await vi.advanceTimersByTimeAsync(30);
  expect(selected).toBe('authors');
  expect(restore).toHaveBeenCalledTimes(1);
  expect(document.activeElement).toBe(slotButton(el, 1));
  stop();
});

// Moved from display-ui.test.ts.
it('shares the exact existing settings URL contract, including automatic shade and aliases', async () => {
  const runtime = display();
  runtime.setOptions({ ...runtime.options, bauto: 2, sub: 'num-left', hpfs: -2, weight: 700, spacing: 0.03 });
  runtime.setOptions({ ...runtime.options, autoShade: true });
  const el = document.createElement('div');
  const shared = vi.fn();
  document.addEventListener('share-settings', shared);
  await section({ display: runtime, privacy: () => false }, 'builtin.display-slots').mount(el);
  [...el.querySelectorAll('button')].find((b) => b.textContent === 'Share settings URL')!.click();
  document.removeEventListener('share-settings', shared);
  const expected = new URL(location.href);
  for (const [key, value] of Object.entries(runtime.options))
    expected.searchParams.set(
      ({ weight: 'wght', spacing: 'ls' } as Record<string, string>)[key] ?? key,
      key === 'shade' && runtime.options.autoShade
        ? 'auto'
        : typeof value === 'boolean'
          ? value
            ? '1'
            : '0'
          : String(value),
    );
  const output = el.querySelector<HTMLInputElement>('input[aria-label="Settings URL"]')!;
  expect(output.hidden).toBe(false);
  expect(output.value).toBe(expected.href);
  expect(shared).toHaveBeenCalledOnce();
  const restored = displayFromURL(defaultDisplay(), new URL(output.value).searchParams);
  expect(restored).toEqual({ ...runtime.options, shade: defaultDisplay().shade });
  expect(new URL(output.value).searchParams.get('shade')).toBe('auto');
});

it('resets every display setting to first-visit defaults after a second click and keeps slots', async () => {
  const { firstVisitDisplay } = await import('../../display');
  const runtime = display();
  runtime.setOptions({ ...runtime.options, size: 24, split: 3 });
  localStorage.setItem('chatty-cat:v1:display-slots', JSON.stringify([null, null, null]));
  const el = document.createElement('div');
  await section({ display: runtime }, 'builtin.display-slots').mount(el);
  const reset = [...el.querySelectorAll('button')].find((b) => b.textContent === 'Reset all display settings')!;
  const preset = vi.fn();
  document.addEventListener('displaypreset', preset);
  reset.click();
  expect(reset.textContent).toBe('Click again to reset');
  expect(runtime.options.size).toBe(24);
  reset.click();
  document.removeEventListener('displaypreset', preset);
  expect(runtime.options).toEqual(firstVisitDisplay());
  expect(reset.textContent).toBe('Reset all display settings');
  expect((preset.mock.calls[0]![0] as CustomEvent).detail).toBe('nightshade');
  expect(localStorage.getItem('chatty-cat:v1:display-slots')).toBe(JSON.stringify([null, null, null]));
});
