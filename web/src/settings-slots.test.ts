// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { DisplaySettings } from './display';
let settings: DisplaySettings | undefined;
afterEach(() => {
  settings?.stop();
  document.body.replaceChildren();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it('saves three validated slots, recalls them and only overwrites deliberately', () => {
  vi.stubGlobal('matchMedia', () => Object.assign(new EventTarget(), { matches: false }));
  const dialog = document.createElement('dialog');
  dialog.innerHTML =
    '<form><select name="size"></select><select name="colour"></select><input name="keywords"></form><button data-slot="0">Slot 1</button><button data-slot="1">Slot 2</button><button data-slot="2">Slot 3</button>';
  const trigger = document.createElement('button');
  document.body.append(dialog, trigger);
  settings = new DisplaySettings(dialog, trigger, vi.fn());
  const size = dialog.querySelector<HTMLSelectElement>('[name=size]')!,
    slot = dialog.querySelector<HTMLButtonElement>('[data-slot="0"]')!;
  size.value = '18';
  size.dispatchEvent(new Event('change', { bubbles: true }));
  slot.click();
  expect(slot.textContent).toContain('saved');
  size.value = '24';
  size.dispatchEvent(new Event('change', { bubbles: true }));
  slot.click();
  expect(size.value).toBe('18');
  size.value = '24';
  size.dispatchEvent(new Event('change', { bubbles: true }));
  slot.dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true }));
  size.value = '14';
  size.dispatchEvent(new Event('change', { bubbles: true }));
  slot.click();
  expect(size.value).toBe('24');
  expect(JSON.parse(localStorage.getItem('chatthing:v1:display-slots')!)[0].display.size).toBe(24);
});
it('reads legacy display slots and restores extra state after display recall', async () => {
  const { registerSettings } = await import('./settings-bundle');
  vi.stubGlobal('matchMedia', () => Object.assign(new EventTarget(), { matches: false }));
  vi.useFakeTimers();
  localStorage.setItem('chatthing:v1:display-slots', JSON.stringify([{ size: 18 }, null, null]));
  const dialog = document.createElement('dialog');
  dialog.innerHTML =
    '<form><select name="size"></select></form><button data-slot="0"></button><button data-slot="1"></button>';
  const trigger = document.createElement('button');
  document.body.append(dialog, trigger);
  settings = new DisplaySettings(dialog, trigger, vi.fn());
  dialog.querySelector<HTMLButtonElement>('[data-slot="0"]')!.click();
  expect(settings.options.size).toBe(18);
  let selected = 'authors';
  const restore = vi.fn((value) => {
    selected = (value as { tab: string }).tab;
  });
  const stop = registerSettings('resources', () => ({ tab: selected }), restore);
  const slot = dialog.querySelector<HTMLButtonElement>('[data-slot="1"]')!;
  slot.click();
  selected = 'help';
  slot.click();
  await vi.advanceTimersByTimeAsync(30);
  expect(selected).toBe('authors');
  expect(restore).toHaveBeenCalledTimes(1);
  expect(document.activeElement).toBe(slot);
  stop();
  vi.useRealTimers();
});
