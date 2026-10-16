// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableCSSFileLoading":true,"handleDisabledFileLoadingAsSuccess":true}}
import { afterEach, expect, it, vi } from 'vitest';
import template from './panel-templates/display-panel.html?raw';
import { DisplaySettings } from './display-ui';
import { DisplayRuntime, defaultDisplay, displayFromURL } from './display';
import { PRESETS } from './display-data';

let settings: DisplaySettings | undefined;
let runtime: DisplayRuntime | undefined;
afterEach(() => {
  settings?.stop();
  runtime?.stop();
  document.body.replaceChildren();
  localStorage.clear();
  vi.unstubAllGlobals();
});
function setup() {
  vi.stubGlobal('matchMedia', () => Object.assign(new EventTarget(), { matches: false }));
  document.body.innerHTML = template;
  const dialog = document.querySelector('dialog')!;
  const trigger = document.createElement('button');
  document.body.append(trigger);
  runtime = new DisplayRuntime(vi.fn());
  settings = new DisplaySettings(dialog, trigger, runtime);
  const select = (name: string) => dialog.querySelector<HTMLSelectElement>(`select[name="${name}"]`)!;
  const change = (name: string, value: string) => {
    const input = select(name);
    input.value = value;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  return { dialog, select, change };
}
it('explains every display option while retaining exact values and order for legacy controls', () => {
  const { select } = setup();
  expect([...select('bauto').options].map((o) => [o.value, o.textContent])).toEqual([
    ['0', 'Always visible'],
    ['1', 'Fade until hovered or focused'],
    ['2', 'Collapse until hovered or focused'],
  ]);
  expect(select('sub').querySelector('option[value="num-left"]')?.textContent).toBe('Number on the left');
  expect(select('hpfs').querySelector('option[value="-2"]')?.textContent).toBe('Two size steps smaller than chat');
  expect(select('rbw').options[0]?.textContent).toBe('Sweep');
  for (const option of document.querySelectorAll('select option')) {
    expect(option.textContent?.trim()).toBeTruthy();
    expect(option.textContent).not.toMatch(/^-?\d+(\.\d+)?$/);
    expect(option.textContent).not.toMatch(/^(num-left|num-right|bauto|mirc|sourcesans)$/);
  }
});
it('stores selected raw values and shares the exact existing URL contract, including automatic shade and aliases', () => {
  const { dialog, change } = setup();
  change('bauto', '2');
  change('sub', 'num-left');
  change('hpfs', '-2');
  change('weight', '700');
  change('spacing', '0.03');
  const autoShade = dialog.querySelector<HTMLInputElement>('input[name="autoShade"]')!;
  autoShade.checked = true;
  autoShade.dispatchEvent(new Event('change', { bubbles: true }));
  const saved = JSON.parse(localStorage.getItem('chatthing:v1:display')!);
  expect(saved).toMatchObject({ bauto: 2, sub: 'num-left', hpfs: -2, weight: 700, spacing: 0.03 });
  const expected = new URL(location.href);
  for (const [key, value] of Object.entries(settings!.options))
    expected.searchParams.set(
      ({ weight: 'wght', spacing: 'ls' } as Record<string, string>)[key] ?? key,
      key === 'shade' && settings!.options.autoShade
        ? 'auto'
        : typeof value === 'boolean'
          ? value
            ? '1'
            : '0'
          : String(value),
    );
  dialog.querySelector<HTMLButtonElement>('#display-share')!.click();
  const shared = dialog.querySelector<HTMLInputElement>('#display-url')!.value;
  expect(shared).toBe(expected.href);
  const restored = displayFromURL(defaultDisplay(), new URL(shared).searchParams);
  expect(restored).toEqual({ ...settings!.options, shade: defaultDisplay().shade });
  expect(new URL(shared).searchParams.get('shade')).toBe('auto');
});
it('preserves every canonical preset key and its resulting display preferences', () => {
  const { select, change } = setup();
  const keys = Object.keys(PRESETS);
  expect(keys).toHaveLength(18);
  expect([...select('preset').options].map((o) => o.value)).toEqual(['', ...keys]);
  for (const key of keys) {
    const expected = displayFromURL(settings!.options, new URLSearchParams({ theme: key }));
    change('preset', key);
    expect(settings!.options).toEqual(expected);
  }
});
