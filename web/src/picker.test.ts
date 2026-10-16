// @vitest-environment happy-dom
import { beforeAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { loadEmojiFixture } from '../test-support/reference-data';
beforeAll(loadEmojiFixture);
import { EmotePicker } from './picker';
import { PickerModel } from './picker-model';
let picker: EmotePicker | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
});
afterEach(() => {
  picker?.stop();
  picker = undefined;
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
function setup(signedIn = true) {
  const root = document.createElement('section');
  root.hidden = true;
  root.innerHTML =
    '<button id="picker-handle"></button><button id="picker-pin"></button><input id="picker-search"><div id="picker-tabs"></div><div id="picker-settings"><button id="picker-reset-order"></button><input id="picker-seenOnly" type="checkbox"><input id="picker-ages" type="checkbox"><select id="picker-ageRows"><option value="0">0</option><option value="1">1</option><option value="2">2</option></select><select id="picker-sort"><option value="use">use</option><option value="az">az</option></select><select id="picker-animation"><option value="all">all</option><option value="animated">animated</option><option value="still">still</option></select><select id="picker-zoom"><option value="0.75">0.75</option><option value="1">1</option><option value="2">2</option></select><input type="checkbox" id="picker-mixed"><input type="checkbox" id="picker-names"><input type="checkbox" id="picker-hold"><input type="checkbox" id="picker-holdPlus"><input type="checkbox" id="picker-frozen"></div><span id="picker-count"></span><div id="picker-recent"></div><div id="picker-grid"></div><button id="picker-more"></button><button id="picker-close"></button>';
  const trigger = document.createElement('button');
  document.body.append(trigger, root);
  const model = new PickerModel();
  model.setMetadata('hasanabi', {
    Kappa: {
      code: 'Kappa',
      source: 'BTTV',
      url: 'https://example.com/a.gif',
      staticUrl: 'https://example.com/a.png',
      animated: true,
      zeroWidth: false,
    },
  });
  const insert = vi.fn();
  picker = new EmotePicker(
    root,
    trigger,
    model,
    () => 'hasanabi',
    () => signedIn,
    insert,
  );
  trigger.click();
  const search = root.querySelector<HTMLInputElement>('#picker-search')!;
  const find = (query: string) => {
    search.value = query;
    search.dispatchEvent(new Event('input'));
  };
  return { root, trigger, model, insert, search, find };
}
it('searches provider emotes, inserts without closing and records recent selection', () => {
  const { root, model, insert, find } = setup();
  find('kappa');
  root.querySelector<HTMLButtonElement>('button[data-insert]')?.click();
  expect(insert).toHaveBeenCalledWith('Kappa');
  expect(root.hidden).toBe(false);
  expect(model.recent('hasanabi')[0]?.code).toBe('Kappa');
});
it('allows anonymous browsing while preventing insertion', () => {
  const { root, insert, find } = setup(false);
  find('kappa');
  const button = root.querySelector<HTMLButtonElement>('button[data-insert]')!;
  expect(button.disabled).toBe(true);
  button.click();
  expect(insert).not.toHaveBeenCalled();
  expect(root.querySelector('#picker-count')?.textContent).toContain('Sign in');
});
it('filters animation and freezes images while persisting options', () => {
  const { root, model, find } = setup();
  find('kappa');
  const freeze = root.querySelector<HTMLInputElement>('#picker-frozen')!;
  freeze.checked = true;
  freeze.dispatchEvent(new Event('change', { bubbles: true }));
  expect(root.querySelector('img')?.src).toBe('https://example.com/a.png');
  expect(model.options.frozen).toBe(true);
  const animation = root.querySelector<HTMLSelectElement>('#picker-animation')!;
  animation.value = 'still';
  animation.dispatchEvent(new Event('change', { bubbles: true }));
  expect(root.querySelectorAll('button[data-insert]')).toHaveLength(0);
  expect(new PickerModel().options.animation).toBe('still');
});
it('holds automatic rebuilds under the pointer and coalesces updates', async () => {
  const { root, model, find } = setup();
  find('kappa');
  const original = root.querySelector('button[data-insert]');
  root.dispatchEvent(new Event('pointerenter'));
  model.setMetadata('hasanabi', {});
  picker?.refresh();
  await vi.advanceTimersByTimeAsync(2000);
  expect(root.querySelector('button[data-insert]')).toBe(original);
  root.dispatchEvent(new Event('pointerleave'));
  expect(root.querySelector('button[data-insert]')).toBeNull();
});
it('closes from Escape outside the picker and restores trigger focus', () => {
  const { root, trigger } = setup();
  const outside = document.createElement('input');
  document.body.append(outside);
  outside.focus();
  outside.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  expect(root.hidden).toBe(true);
  expect(document.activeElement).toBe(trigger);
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
});
it('inserts the first search result with Enter', () => {
  const { find, search, insert } = setup();
  find('kappa');
  search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  expect(insert).toHaveBeenCalledWith('Kappa');
});
it('borrows animation freeze over the grid without saving it or replacing cells', () => {
  const { root, model, find } = setup();
  find('kappa');
  const grid = root.querySelector('#picker-grid')!,
    button = grid.querySelector('button'),
    image = grid.querySelector('img')!;
  grid.dispatchEvent(new Event('pointerenter'));
  expect(image.src).toBe('https://example.com/a.png');
  expect(grid.querySelector('button')).toBe(button);
  expect(model.options.frozen).toBe(false);
  grid.dispatchEvent(new Event('pointerleave'));
  expect(image.src).toBe('https://example.com/a.gif');
  const freeze = root.querySelector<HTMLInputElement>('#picker-frozen')!;
  freeze.checked = true;
  freeze.dispatchEvent(new Event('change', { bubbles: true }));
  grid.dispatchEvent(new Event('pointerenter'));
  grid.dispatchEvent(new Event('pointerleave'));
  expect(grid.querySelector('img')?.src).toBe('https://example.com/a.png');
  expect(new PickerModel().options.frozen).toBe(true);
});
it('keeps hidden picker images still through Hold+ release and restores them only when visible', () => {
  let hidden = false;
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  const { root, find, model } = setup();
  find('kappa');
  const grid = root.querySelector('#picker-grid')!,
    image = grid.querySelector('img')!;
  grid.dispatchEvent(new Event('pointerenter'));
  hidden = true;
  document.dispatchEvent(new Event('visibilitychange'));
  grid.dispatchEvent(new Event('pointerleave'));
  expect(image.src).toBe('https://example.com/a.png');
  expect(model.options.frozen).toBe(false);
  hidden = false;
  document.dispatchEvent(new Event('visibilitychange'));
  expect(image.src).toBe('https://example.com/a.gif');
  picker!.close();
  expect(image.src).toBe('https://example.com/a.png');
  document.dispatchEvent(new Event('visibilitychange'));
  expect(image.src).toBe('https://example.com/a.png');
});
it('validates shared picker geometry before fitting it to the viewport', async () => {
  const { parsePickerGeometry } = await import('./picker');
  expect(parsePickerGeometry('876x625,646,173')).toEqual({ width: 876, height: 625, left: 646, top: 173 });
  for (const value of ['NaNx400', '10x20', '300x199', 'Infinityx300', '400x300,1,evil'])
    expect(parsePickerGeometry(value)).toBeUndefined();
});
it('resets recorded ordering through both the button and middle-click', () => {
  const { root, model } = setup();
  const channel = 'hasanabi';
  const observe = () =>
    model.observe(
      {
        id: crypto.randomUUID(),
        command: 'PRIVMSG',
        text: 'Kappa',
        login: 'alice',
        channel,
        timestamp: Date.now(),
        tags: {},
      },
      true,
    );
  observe();
  expect(model.lastUse(channel, 'Kappa')).toBeGreaterThan(0);
  root.querySelector<HTMLButtonElement>('#picker-reset-order')!.click();
  expect(model.lastUse(channel, 'Kappa')).toBe(0);
  observe();
  root.querySelector('#picker-sort')!.dispatchEvent(new MouseEvent('auxclick', { button: 1, cancelable: true }));
  expect(model.lastUse(channel, 'Kappa')).toBe(0);
});
it('places grouped pending ages once after all provider cells', () => {
  const { root, model } = setup();
  model.options.enabled = ['BTTV', 'FFZ'];
  model.options.mixed = false;
  model.options.ages = true;
  model.options.sort = 'use';
  model.setMetadata('hasanabi', {
    Never: {
      code: 'Never',
      source: 'BTTV',
      url: 'https://example.com/n.png',
      staticUrl: 'https://example.com/n.png',
      animated: false,
      zeroWidth: false,
    },
    Used: {
      code: 'Used',
      source: 'FFZ',
      url: 'https://example.com/u.png',
      staticUrl: 'https://example.com/u.png',
      animated: false,
      zeroWidth: false,
    },
  });
  model.observe(
    {
      id: 'age-fixture',
      command: 'PRIVMSG',
      text: 'Used',
      login: 'alice',
      channel: 'hasanabi',
      timestamp: Date.now() - 45000,
      tags: {},
    },
    true,
  );
  picker!.refresh(true);
  const grid = root.querySelector('#picker-grid')!,
    pending = [...grid.querySelectorAll<HTMLElement>('.picker-age.soon')];
  expect(pending.length).toBeGreaterThan(0);
  expect(new Set(pending.map((mark) => mark.dataset.age)).size).toBe(pending.length);
  const children = [...grid.children],
    lastCell = Math.max(...children.map((child, index) => (child.matches('button') ? index : -1)));
  expect(pending.every((mark) => children.indexOf(mark) > lastCell)).toBe(true);
});
it('updates picker controls and saved options when a display preset is selected', () => {
  const { root, model } = setup();
  model.options.zoom = 2;
  document.dispatchEvent(new CustomEvent('displaypreset', { detail: 'nightshade' }));
  expect(model.options.zoom).toBe(0.75);
  expect(root.querySelector<HTMLSelectElement>('#picker-zoom')!.value).toBe('0.75');
  expect(new PickerModel().options.zoom).toBe(0.75);
  document.dispatchEvent(new CustomEvent('displaypreset', { detail: 'old-default' }));
  expect(model.options.mixed).toBe(true);
  expect(root.querySelector<HTMLInputElement>('#picker-mixed')!.checked).toBe(true);
  expect(root.querySelector<HTMLButtonElement>('#picker-pin')!.getAttribute('aria-pressed')).toBe('true');
});
it('navigates Unicode categories and tones, persists local image style and inserts an intact sequence', () => {
  const { root, model, find, insert } = setup();
  const choose = (id: string, value: string) => {
    const select = root.querySelector<HTMLSelectElement>('#picker-' + id)!;
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  };
  choose('emojiStyle', 'image');
  expect(model.options.emojiStyle).toBe('image');
  choose('emojiCategory', 'People & Body');
  choose('emojiTone', '1f3fd');
  find('ballet dancer');
  const button = root.querySelector<HTMLButtonElement>('button[data-insert]')!;
  expect(button.dataset.insert).toBe('🧑🏽‍🩰');
  expect(button.querySelector('img')?.getAttribute('src')).toMatch(/^\/emoji\/twemoji-17.0.3\//);
  button.click();
  expect(insert).toHaveBeenCalledWith('🧑🏽‍🩰');
  expect(new PickerModel().options.emojiStyle).toBe('image');
});
it('caps rendered picker rows while allowing category/search narrowing', () => {
  const { root, find } = setup();
  find('');
  const more = root.querySelector<HTMLButtonElement>('#picker-more')!;
  for (let i = 0; i < 5; i++) more.click();
  expect(root.querySelectorAll('#picker-grid button[data-insert]').length).toBeLessThanOrEqual(600);
  expect(root.querySelector('#picker-count')?.textContent).toContain('600-row limit');
  find('distorted face');
  expect(root.querySelectorAll('#picker-grid button[data-insert]')).toHaveLength(1);
});
it('keeps IME Enter from inserting emoji and uses accessible labels after image failure', () => {
  const { root, find, search, insert } = setup();
  const style = root.querySelector<HTMLSelectElement>('#picker-emojiStyle')!;
  style.value = 'image';
  style.dispatchEvent(new Event('change', { bubbles: true }));
  find('distorted face');
  search.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }),
  );
  expect(insert).not.toHaveBeenCalled();
  const button = root.querySelector<HTMLButtonElement>('button[data-insert]')!;
  expect(button.getAttribute('aria-label')).toContain('distorted face');
  button.querySelector('img')!.dispatchEvent(new Event('error'));
  expect(button.textContent).toContain('[distorted face]');
  search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  expect(insert).toHaveBeenCalledWith('🫪');
});
it('preserves additive emoji preferences when restoring a legacy workspace snapshot', () => {
  const { root, model } = setup();
  const style = root.querySelector<HTMLSelectElement>('#picker-emojiStyle')!;
  style.value = 'image';
  style.dispatchEvent(new Event('change', { bubbles: true }));
  const detail: Record<string, unknown> = {};
  document.dispatchEvent(new CustomEvent('capture-settings', { detail }));
  const snapshot = detail.picker;
  if (!snapshot || typeof snapshot !== 'object' || !('floating' in snapshot))
    throw new Error('Missing captured picker');
  document.dispatchEvent(
    new CustomEvent('restore-settings', {
      detail: { picker: { options: { enabled: ['Emoji'], sort: 'az' }, floating: snapshot.floating } },
    }),
  );
  expect(model.options.emojiStyle).toBe('image');
  expect(root.querySelector<HTMLSelectElement>('#picker-emojiStyle')?.value).toBe('image');
});
