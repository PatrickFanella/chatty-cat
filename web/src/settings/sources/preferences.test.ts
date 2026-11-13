// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  completionDefaults,
  getCompletionPreferences,
  getLocalNickname,
  setCompletionPreferences,
} from '../../completion-preferences';
import { setProfileScope } from '../../account-profiles';
import { getLinkPreferences, linkDefaults, setLinkPreferences } from '../../link-preferences';
import {
  ProviderPreferenceStore,
  getProviderPreferences,
  providerDefaults,
  setProviderPreferences,
} from '../../provider-preferences';
import type { SettingsHost } from '../host';
import type { SettingDef } from '../registry';
import { COMPLETION_EXCLUDED, completionSettings } from './completion';
import { LINK_EXCLUDED, linkSettings } from './links';
import { PROVIDER_EXCLUDED, providerSettings } from './providers';

const EVENTS = ['presentation-before-change', 'linkpreferenceschange'];
let rerender: ReturnType<typeof vi.fn>;
let providersChanged: ReturnType<typeof vi.fn>;
let host: SettingsHost;

beforeEach(() => {
  localStorage.clear();
  rerender = vi.fn();
  providersChanged = vi.fn();
  host = { rerender, providersChanged } as unknown as SettingsHost;
});

afterEach(() => {
  vi.unstubAllGlobals();
  setProfileScope('anonymous');
  localStorage.clear();
  setLinkPreferences(linkDefaults);
  setCompletionPreferences(completionDefaults);
  setProviderPreferences(providerDefaults());
});

const find = (defs: SettingDef[], id: string): SettingDef => defs.find((d) => d.id === id)!;

function leaves(value: unknown, prefix: string): string[] {
  if (value && typeof value === 'object' && !Array.isArray(value))
    return Object.entries(value).flatMap(([k, v]) => leaves(v, `${prefix}.${k}`));
  return [prefix];
}

it('each preference source covers every key except version', () => {
  const links = Object.keys(linkDefaults).filter((k) => !(LINK_EXCLUDED as readonly string[]).includes(k));
  expect(new Set(linkSettings(host).map((d) => d.id))).toEqual(new Set(links.map((k) => `links.${k}`)));
  const comp = Object.keys(completionDefaults).filter((k) => !(COMPLETION_EXCLUDED as readonly string[]).includes(k));
  expect(new Set(completionSettings(host).map((d) => d.id))).toEqual(new Set(comp.map((k) => `completion.${k}`)));
  const { version, ...rest } = providerDefaults();
  void version;
  void PROVIDER_EXCLUDED;
  expect(new Set(providerSettings(host).map((d) => d.id))).toEqual(new Set(leaves(rest, 'providers')));
  for (const d of [...linkSettings(host), ...completionSettings(host), ...providerSettings(host)])
    expect(d.private).toBe(true);
});

it('link write saves, sets and announces', () => {
  const seen: string[] = [];
  const listen = (e: Event) => seen.push(e.type);
  for (const t of EVENTS) document.addEventListener(t, listen);
  find(linkSettings(host), 'links.tooltip').write(true);
  expect(getLinkPreferences().tooltip).toBe(true);
  expect(JSON.parse(localStorage.getItem(Object.keys(localStorage)[0]!)!).tooltip).toBe(true);
  expect(seen.filter((t) => t === 'linkpreferenceschange')).toHaveLength(1);
  expect(seen.filter((t) => t === 'presentation-before-change')).toHaveLength(1);
  expect(rerender).toHaveBeenCalledTimes(1);
  for (const t of EVENTS) document.removeEventListener(t, listen);
});

it('link numbers clamp and invalid text is rejected without saving', () => {
  const defs = linkSettings(host);
  find(defs, 'links.thumbnailSize').write(5000);
  expect(getLinkPreferences().thumbnailSize).toBe(640);
  expect(() => find(defs, 'links.engineURL').write('ftp://nope/{query}')).toThrow();
  expect(() => find(defs, 'links.engineName').write('  ')).toThrow();
  expect(getLinkPreferences().engineURL).toBe(linkDefaults.engineURL);
});

it('completion aliases round-trip through text', () => {
  const defs = completionSettings(host);
  find(defs, 'completion.aliases').write('alice=Al\nbob=B');
  expect(getLocalNickname('alice')).toBe('Al');
  expect(find(defs, 'completion.aliases').read()).toBe('alice=Al\nbob=B');
  find(defs, 'completion.emotePriority').write('Kappa, PogChamp');
  expect(find(defs, 'completion.emotePriority').read()).toBe('Kappa, PogChamp');
  expect(() => find(defs, 'completion.aliases').write('no equals sign')).toThrow('Not a valid value');
  expect(find(defs, 'completion.aliases').read()).toBe('alice=Al\nbob=B');
});

it('provider nested toggle writes one leaf', () => {
  const seen: string[] = [];
  const listen = (e: Event) => seen.push(e.type);
  for (const t of EVENTS) document.addEventListener(t, listen);
  find(providerSettings(host), 'providers.providers.7TV.live').write(false);
  const p = getProviderPreferences();
  expect(p.providers['7TV']).toEqual({ global: true, channel: true, live: false });
  expect(p.providers.BTTV.live).toBe(true);
  expect(providersChanged).toHaveBeenCalledTimes(1);
  expect(seen.filter((t) => t === 'presentation-before-change')).toHaveLength(1);
  for (const t of EVENTS) document.removeEventListener(t, listen);
});

it('provider placement splits emote display from integrations', () => {
  const defs = providerSettings(host);
  expect(find(defs, 'providers.scale').page).toBe('general');
  expect(find(defs, 'providers.badges.vanity').page).toBe('integrations');
  find(defs, 'providers.tooltipScale').write('1.5');
  expect(getProviderPreferences().tooltipScale).toBe(1.5);
});

// Moved from completion-preferences-ui.test.ts.
it('completion writes save for the current account and keep the active value on failed storage', () => {
  setProfileScope('42');
  const aliases = find(completionSettings(host), 'completion.aliases');
  aliases.write('alice=Friend');
  expect(getCompletionPreferences().aliases).toEqual([{ login: 'alice', alias: 'Friend' }]);
  expect(localStorage.getItem('chatty-cat:v1:profile:42:completion-preferences')).toContain('alice');
  const raw = localStorage.getItem('chatty-cat:v1:profile:42:completion-preferences');
  vi.stubGlobal('localStorage', {
    getItem: () => raw,
    setItem: () => {
      throw new Error('quota');
    },
  });
  expect(() => aliases.write('bob=Other')).toThrow('quota');
  expect(getCompletionPreferences().aliases).toEqual([{ login: 'alice', alias: 'Friend' }]);
});

// Moved from link-preferences.test.ts: remote fetches stay off until a write saves them.
it('link writes enable remote fetches only once saved', () => {
  expect(getLinkPreferences().enabled).toBe(false);
  const defs = linkSettings(host);
  find(defs, 'links.enabled').write(true);
  find(defs, 'links.thumbnails').write(true);
  const saved = JSON.parse(localStorage.getItem('chatty-cat:v1:link-preferences')!);
  expect(saved).toMatchObject({ enabled: true, thumbnails: true });
  expect(getLinkPreferences().enabled).toBe(true);
});

// Moved from provider-preferences.test.ts: a provider write persists to the provider store.
it('provider writes persist to the provider store', () => {
  find(providerSettings(host), 'providers.providers.FFZ.channel').write(false);
  expect(new ProviderPreferenceStore().read().providers.FFZ.channel).toBe(false);
});
