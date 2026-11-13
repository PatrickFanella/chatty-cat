// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getPresentation, presentationDefaults, setPresentation } from '../../presentation';
import { profileKey, setProfileScope } from '../../account-profiles';
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
  vi.unstubAllGlobals();
  localStorage.clear();
  setCompletionPreferences(completionDefaults);
  setPresentation({ ...presentationDefaults });
  setProfileScope('anonymous');
  document.documentElement.style.removeProperty('--overlay-background-alpha');
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

it('writes keep imported timestamp, separator and zebra copies and still copy completion choices', () => {
  runtime.persist({
    ...runtime.saved,
    separators: 'on',
    alternating: 'off',
    timestampFormat: 'HH:mm',
    showTimestamps: false,
  });
  setCompletionPreferences({ ...getCompletionPreferences(), mentionAt: true, mentionComma: false });
  get('presentation.boldUsernames').write(false);
  expect(runtime.saved.separators).toBe('on');
  expect(runtime.saved.alternating).toBe('off');
  expect(runtime.saved.timestampFormat).toBe('HH:mm');
  expect(runtime.saved.showTimestamps).toBe(false);
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

it('an invalid muted channel list is refused and keeps the stored list', () => {
  const muted = get('presentation.mutedChannels');
  muted.write('Alice, bob bob');
  expect(runtime.saved.mutedChannels).toBe('alice,bob');
  const stored = localStorage.getItem('chatty-cat:v1:presentation');
  expect(() => muted.write('alice, not-a-login!')).toThrow('Not a valid value');
  expect(runtime.saved.mutedChannels).toBe('alice,bob');
  expect(localStorage.getItem('chatty-cat:v1:presentation')).toBe(stored);
  muted.write('');
  expect(runtime.saved.mutedChannels).toBe('');
});

// Moved from presentation-ui.test.ts: a failed save keeps the saved and active values.
it('a failed save keeps saved preferences and reports the storage error', () => {
  get('presentation.collapseLines').write(4);
  const raw = localStorage.getItem('chatty-cat:v1:presentation');
  vi.stubGlobal('localStorage', {
    getItem: () => raw,
    setItem: () => {
      throw new Error('Quota');
    },
  });
  expect(() => get('presentation.collapseLines').write(9)).toThrow('Quota');
  expect(runtime.saved.collapseLines).toBe(4);
  expect(getPresentation().collapseLines).toBe(4);
});

// Moved from presentation-ui.test.ts: saved values apply at startup without any settings UI.
it('applies saved presentation without an editor and ignores cancellation after teardown', () => {
  runtime.stop();
  localStorage.setItem('chatty-cat:v1:presentation', JSON.stringify({ ...presentationDefaults, collapseLines: 8 }));
  const changed = vi.fn();
  runtime = new PresentationRuntime(changed);
  expect(getPresentation().collapseLines).toBe(8);
  expect(document.querySelector('dialog')).toBeNull();
  runtime.stop();
  changed.mockClear();
  const event = vi.fn();
  document.addEventListener('presentationchange', event);
  runtime.cancel();
  expect(changed).not.toHaveBeenCalled();
  expect(event).not.toHaveBeenCalled();
  document.removeEventListener('presentationchange', event);
});

// Moved from overlay-appearance-ui.test.ts: overlay appearance saves in the current profile and applies.
it('overlay appearance saves in the current profile and applies its style', () => {
  runtime.stop();
  setProfileScope('42');
  runtime = new PresentationRuntime(() => {});
  host.overlay = true;
  defs = presentationSettings(Object.assign(host, { presentation: runtime }) as unknown as SettingsHost);
  get('presentation.overlayBackgroundOpacity').write(128);
  expect(JSON.parse(localStorage.getItem(profileKey('chatty-cat:v1:presentation'))!).overlayBackgroundOpacity).toBe(
    128,
  );
  expect(document.documentElement.style.getPropertyValue('--overlay-background-alpha')).toBe('50.19607843137255%');
  expect(document.documentElement.style.opacity).toBe('');
});
