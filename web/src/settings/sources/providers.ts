import {
  BADGE_CATEGORIES,
  PROVIDERS,
  ProviderPreferenceStore,
  getProviderPreferences,
  parseProviderPreferences,
  providerDefaults,
  setProviderPreferences,
  type ProviderPreferences,
} from '../../provider-preferences';
import type { Control, PageId, SettingDef } from '../registry';
import type { SettingsHost } from '../host';

export const PROVIDER_EXCLUDED = ['version'] as const;

type Path = string[];

const EMOTE_KEYS = [
  'images',
  'zeroWidth',
  'scaleEmotesByLineHeight',
  'removeSpacesBetweenEmotes',
  'animated',
  'showUnlistedSevenTV',
  'tooltipScale',
  'scale',
] as const;

interface Spec {
  path: Path;
  label: string;
  control: Control;
}

const TOGGLE: Control = { kind: 'toggle' };

function specs(): Spec[] {
  const out: Spec[] = [];
  for (const provider of PROVIDERS)
    for (const key of ['global', 'channel', 'live'] as const)
      out.push({
        path: ['providers', provider, key],
        label: `${provider} ${key === 'live' ? 'live refresh' : key + ' emotes'}`,
        control: TOGGLE,
      });
  for (const role of ['moderator', 'vip'] as const)
    out.push({
      path: ['ffzRoleArtwork', role],
      label: `Use FFZ ${role} artwork for native Twitch badges`,
      control: TOGGLE,
    });
  for (const name of ['FFZ', 'Chatterino', 'BTTV', '7TV'] as const)
    out.push({
      path: ['cosmetics', name],
      label: `Allow ${name} cosmetic badges (requires server configuration)`,
      control: TOGGLE,
    });
  out.push({
    path: ['sevenTVEventAPI'],
    label: 'Allow 7TV event connections (requires server configuration)',
    control: TOGGLE,
  });
  for (const name of ['BTTV', '7TV'] as const)
    out.push({
      path: ['activity', name],
      label: `Allow ${name} activity sharing (start a reviewed session separately)`,
      control: TOGGLE,
    });
  for (const category of BADGE_CATEGORIES)
    out.push({ path: ['badges', category], label: `Show ${category} badges`, control: TOGGLE });
  out.push(
    { path: ['images'], label: 'Show native and provider emote images (off keeps names as text)', control: TOGGLE },
    { path: ['zeroWidth'], label: 'Allow zero-width emote layering', control: TOGGLE },
    { path: ['animated'], label: 'Animate emotes and cheer images', control: TOGGLE },
    {
      path: ['stackBits'],
      label: 'Combine recognized cheers when their amounts match Twitch’s bits total',
      control: TOGGLE,
    },
    { path: ['scaleEmotesByLineHeight'], label: 'Scale emotes by chat line height', control: TOGGLE },
    { path: ['showUnlistedSevenTV'], label: 'Show unlisted 7TV emotes', control: TOGGLE },
    { path: ['removeSpacesBetweenEmotes'], label: 'Remove visual spaces between emotes', control: TOGGLE },
    {
      path: ['tooltipScale'],
      label: 'Emote tooltip scale (image tooltip consent required)',
      control: {
        kind: 'choice',
        options: [0.5, 1, 1.5, 2].map((value) => ({ value, label: `${value}×` })),
      },
    },
    { path: ['scale'], label: 'Emote scale', control: { kind: 'number', min: 0.5, max: 3, step: 0.1 } },
  );
  return out;
}

function leaf(p: ProviderPreferences, path: Path): unknown {
  let node: unknown = p;
  for (const part of path) node = (node as Record<string, unknown>)[part];
  return node;
}

function place(path: Path): { page: PageId; section: string } {
  if (path.length === 1 && (EMOTE_KEYS as readonly string[]).includes(path[0]!))
    return { page: 'general', section: 'Emotes' };
  return { page: 'integrations', section: 'Providers and badges' };
}

export function providerSettings(host: SettingsHost): SettingDef[] {
  return specs().map(({ path, label, control }) => ({
    id: `providers.${path.join('.')}`,
    ...place(path),
    label,
    control,
    private: true,
    read: () => leaf(getProviderPreferences(), path),
    defaultValue: () => leaf(providerDefaults(), path),
    write(value) {
      let v: unknown = value;
      if (control.kind === 'number') v = Math.min(control.max, Math.max(control.min, Number(value)));
      else if (control.kind === 'choice') v = Number(value);
      const draft = structuredClone(getProviderPreferences()) as unknown as Record<string, unknown>;
      let node = draft;
      for (const part of path.slice(0, -1)) node = node[part] as Record<string, unknown>;
      node[path[path.length - 1]!] = v;
      const next = parseProviderPreferences(draft);
      new ProviderPreferenceStore().save(next);
      setProviderPreferences(next);
      document.dispatchEvent(new Event('presentation-before-change'));
      host.providersChanged();
    },
  }));
}
