// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { presentationDefaults } from '../../presentation';
import { PresentationRuntime } from '../../presentation-runtime';
import { completionDefaults, getCompletionPreferences, setCompletionPreferences } from '../../completion-preferences';
import type { SettingsHost } from '../host';
import type { SettingDef } from '../registry';
import { PRESENTATION_EXCLUDED, presentationSettings } from './presentation';

let runtime: PresentationRuntime;
let rerender: ReturnType<typeof vi.fn>;
let host: { overlay: boolean };
let defs: SettingDef[];

beforeEach(() => {
  localStorage.clear();
  runtime = new PresentationRuntime(() => {});
  rerender = vi.fn();
  host = { overlay: false };
  Object.assign(host, { presentation: runtime, rerender });
  defs = presentationSettings(host as unknown as SettingsHost);
});

afterEach(() => {
  runtime.stop();
  localStorage.clear();
  setCompletionPreferences(completionDefaults);
});

const get = (id: string): SettingDef => defs.find((d) => d.id === id)!;

it('covers every presentation key except exclusions', () => {
  const keys = Object.keys(presentationDefaults).filter(
    (k) => !(PRESENTATION_EXCLUDED as readonly string[]).includes(k),
  );
  expect(new Set(defs.map((d) => d.id))).toEqual(new Set(keys.map((k) => `presentation.${k}`)));
  expect(defs.every((d) => d.private)).toBe(true);
});

it('writes persist through parsePresentation and rerender', () => {
  get('presentation.collapseLines').write(99);
  expect(runtime.saved.collapseLines).toBe(20);
  expect(get('presentation.collapseLines').read()).toBe(20);
  expect(rerender).toHaveBeenCalledTimes(1);
});

it('writes collapse duplicate copies to legacy', () => {
  runtime.persist({ ...runtime.saved, separators: 'on', timestampFormat: 'HH:mm', showTimestamps: false });
  setCompletionPreferences({ ...getCompletionPreferences(), mentionAt: true, mentionComma: false });
  get('presentation.boldUsernames').write(false);
  expect(runtime.saved.separators).toBe('legacy');
  expect(runtime.saved.timestampFormat).toBe('legacy');
  expect(runtime.saved.showTimestamps).toBe(true);
  expect(runtime.saved.mentionAt).toBe(true);
  expect(runtime.saved.mentionComma).toBe(false);
  expect(runtime.saved.boldUsernames).toBe(false);
});

it('overlay settings are visible only in overlay mode', () => {
  const overlay = get('presentation.overlayShadow');
  expect(overlay.visible!()).toBe(false);
  host.overlay = true;
  expect(overlay.visible!()).toBe(true);
});
