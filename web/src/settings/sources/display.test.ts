// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DisplayRuntime, defaultDisplay, displayFromURL, firstVisitDisplay } from '../../display';
import { PRESETS } from '../../display-data';
import { presentationDefaults, setPresentation } from '../../presentation';
import { PresentationRuntime } from '../../presentation-runtime';
import { profileKey } from '../../account-profiles';
import type { SettingsHost } from '../host';
import type { SettingDef } from '../registry';
import { DISPLAY_EXCLUDED, displaySettings } from './display';

let runtime: DisplayRuntime;
let presentation: PresentationRuntime;
let permission: ReturnType<typeof vi.fn>;
let defs: SettingDef[];

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => Object.assign(new EventTarget(), { matches: false }));
  localStorage.clear();
  runtime = new DisplayRuntime(() => {});
  permission = vi.fn(async () => 'granted');
  presentation = new PresentationRuntime(() => {});
  const host = {
    display: runtime,
    presentation,
    attention: { permission, test: async () => '' },
  } as unknown as SettingsHost;
  defs = displaySettings(host);
});

afterEach(() => {
  runtime.stop();
  presentation.stop();
  setPresentation({ ...presentationDefaults });
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
  expect(get('display.preset').control).toMatchObject({ placeholder: 'Choose a preset…' });
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

it('writing timestamps, separators or zebra resets the matching presentation copy to legacy', () => {
  presentation.persist({
    ...presentation.saved,
    showTimestamps: false,
    timestampFormat: 'HH:mm',
    separators: 'on',
    alternating: 'off',
  });
  get('display.size').write(16);
  expect(presentation.saved.timestampFormat).toBe('HH:mm');
  expect(presentation.saved.separators).toBe('on');
  expect(presentation.saved.alternating).toBe('off');
  get('display.times').write(2);
  expect(runtime.options.times).toBe(2);
  expect(presentation.saved.showTimestamps).toBe(true);
  expect(presentation.saved.timestampFormat).toBe('legacy');
  expect(presentation.saved.separators).toBe('on');
  get('display.lines').write(1);
  expect(presentation.saved.separators).toBe('legacy');
  expect(presentation.saved.alternating).toBe('off');
  get('display.zebra').write(1);
  expect(presentation.saved.alternating).toBe('legacy');
});

it('text fields refuse a value the parser would replace and keep the stored text', () => {
  const words = get('display.keywords');
  words.write('  alpha, beta ');
  expect(runtime.options.keywords).toBe('  alpha, beta ');
  const stored = localStorage.getItem(profileKey('chatty-cat:v1:display'));
  for (const id of ['display.keywords', 'display.blocked', 'display.hidden']) {
    const before = get(id).read();
    expect(() => get(id).write(42)).toThrow('Not a valid value');
    expect(get(id).read()).toBe(before);
  }
  expect(localStorage.getItem(profileKey('chatty-cat:v1:display'))).toBe(stored);
  words.write('x'.repeat(1200));
  expect(runtime.options.keywords).toBe('x'.repeat(1000));
});
