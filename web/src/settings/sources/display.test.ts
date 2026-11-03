// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DisplayRuntime, defaultDisplay, displayFromURL, firstVisitDisplay } from '../../display';
import { PRESETS } from '../../display-data';
import type { SettingsHost } from '../host';
import type { SettingDef } from '../registry';
import { DISPLAY_EXCLUDED, displaySettings } from './display';

let runtime: DisplayRuntime;
let permission: ReturnType<typeof vi.fn>;
let defs: SettingDef[];

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => Object.assign(new EventTarget(), { matches: false }));
  localStorage.clear();
  runtime = new DisplayRuntime(() => {});
  permission = vi.fn(async () => 'granted');
  const host = {
    display: runtime,
    attention: { permission, test: async () => '' },
  } as unknown as SettingsHost;
  defs = displaySettings(host);
});

afterEach(() => {
  runtime.stop();
  localStorage.clear();
  vi.unstubAllGlobals();
});

const get = (id: string): SettingDef => defs.find((d) => d.id === id)!;

it('covers every display key except exclusions', () => {
  const keys = Object.keys(defaultDisplay()).filter((k) => !(DISPLAY_EXCLUDED as readonly string[]).includes(k));
  const ids = defs.map((d) => d.id).filter((id) => id !== 'display.preset');
  expect(new Set(ids)).toEqual(new Set(keys.map((k) => `display.${k}`)));
  expect(defs.every((d) => d.private)).toBe(true);
});

it('writes through setOptions and parse', () => {
  get('display.size').write(99);
  expect(runtime.options.size).toBe(14);
  get('display.size').write(18);
  expect(get('display.size').read()).toBe(18);
});

it('writing shade turns off autoShade', () => {
  get('display.autoShade').write(true);
  expect(runtime.options.autoShade).toBe(true);
  get('display.shade').write(2);
  expect(runtime.options.autoShade).toBe(false);
  expect(runtime.options.shade).toBe(2);
});

it('preset write applies the preset values', () => {
  get('display.preset').write('irc');
  expect(runtime.options.font).toBe('fixedsys');
  expect(get('display.preset').read()).toBe('');
});

it('defaults come from firstVisitDisplay', () => {
  const first = firstVisitDisplay();
  expect(get('display.size').defaultValue()).toBe(first.size);
  expect(get('display.zebra').defaultValue()).toBe(first.zebra);
  expect(get('display.preset').defaultValue()).toBe('nightshade');
});

it('turning notify on requests permission once', () => {
  get('display.notify').write(true);
  get('display.notify').write(true);
  get('display.notify').write(false);
  expect(permission).toHaveBeenCalledTimes(1);
  expect(runtime.options.notify).toBe(false);
});

// Moved from display-ui.test.ts.
it('preserves every canonical preset key and its resulting display preferences', () => {
  const keys = Object.keys(PRESETS);
  expect(keys).toHaveLength(18);
  const preset = get('display.preset');
  expect(preset.control.kind === 'choice' && preset.control.options.map((o) => o.value)).toEqual(keys);
  const announced: unknown[] = [];
  const listen = (event: Event) => announced.push((event as CustomEvent).detail);
  document.addEventListener('displaypreset', listen);
  for (const key of keys) {
    const expected = displayFromURL(runtime.options, new URLSearchParams({ theme: key }));
    preset.write(key);
    expect(runtime.options).toEqual(expected);
  }
  document.removeEventListener('displaypreset', listen);
  // The emote picker applies its matching preset from this event.
  expect(announced).toEqual(keys);
});

// Moved from display-ui.test.ts.
it('explains every display option while keeping exact values and order', () => {
  const options = (id: string) => {
    const control = get(id).control;
    return control.kind === 'choice' ? control.options.map((o) => [o.value, o.label]) : [];
  };
  expect(options('display.bauto')).toEqual([
    [0, 'Always visible'],
    [1, 'Fade until hovered or focused'],
    [2, 'Collapse until hovered or focused'],
  ]);
  expect(options('display.sub').find(([value]) => value === 'num-left')?.[1]).toBe('Number on the left');
  expect(options('display.hpfs').find(([value]) => value === -2)?.[1]).toBe('Two size steps smaller than chat');
  expect(options('display.rbw')[0]?.[1]).toBe('Sweep');
  for (const def of defs)
    if (def.control.kind === 'choice')
      for (const { label } of def.control.options) {
        expect(label.trim()).toBeTruthy();
        expect(label).not.toMatch(/^-?\d+(\.\d+)?$/);
        expect(label).not.toMatch(/^(num-left|num-right|bauto|mirc|sourcesans)$/);
      }
});
