// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DisplayRuntime, defaultDisplay, firstVisitDisplay } from '../../display';
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
