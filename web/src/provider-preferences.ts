import { getProfileScope, profileKey } from './account-profiles';
import type { ChannelMetadata, Provider } from './metadata';
import type { Emote } from './tokens';
export const PROVIDERS = ['7TV', 'BTTV', 'FFZ', 'Twitch'] as const;
export const BADGE_CATEGORIES = [
  'globalAuthority',
  'channelAuthority',
  'subscription',
  'predictions',
  'vanity',
] as const;
type BadgeCategory = (typeof BADGE_CATEGORIES)[number];
export interface ProviderPreferences {
  version: 1;
  images: boolean;
  zeroWidth: boolean;
  stackBits: boolean;
  scaleEmotesByLineHeight: boolean;
  showUnlistedSevenTV: boolean;
  removeSpacesBetweenEmotes: boolean;
  tooltipScale: number;
  ffzRoleArtwork: { moderator: boolean; vip: boolean };
  activity: { BTTV: boolean; '7TV': boolean };
  sevenTVEventAPI: boolean;
  cosmetics: { FFZ: boolean; Chatterino: boolean; BTTV: boolean; '7TV': boolean };
  providers: Record<Provider, { global: boolean; channel: boolean; live: boolean }>;
  badges: Record<BadgeCategory, boolean>;
  animated: boolean;
  scale: number;
}
export function providerDefaults(): ProviderPreferences {
  return {
    version: 1,
    images: true,
    zeroWidth: true,
    stackBits: false,
    scaleEmotesByLineHeight: false,
    showUnlistedSevenTV: false,
    removeSpacesBetweenEmotes: false,
    tooltipScale: 1,
    ffzRoleArtwork: { moderator: true, vip: true },
    activity: { BTTV: false, '7TV': false },
    sevenTVEventAPI: false,
    cosmetics: { FFZ: false, Chatterino: false, BTTV: false, '7TV': false },
    providers: {
      '7TV': { global: true, channel: true, live: true },
      BTTV: { global: true, channel: true, live: true },
      FFZ: { global: true, channel: true, live: true },
      Twitch: { global: true, channel: true, live: true },
    },
    badges: { globalAuthority: true, channelAuthority: true, subscription: true, predictions: true, vanity: true },
    animated: true,
    scale: 1,
  };
}
function record(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
export function parseProviderPreferences(v: unknown): ProviderPreferences {
  if (v === null) return providerDefaults();
  if (
    !record(v) ||
    v.version !== 1 ||
    !record(v.providers) ||
    !record(v.badges) ||
    typeof v.animated !== 'boolean' ||
    typeof v.scale !== 'number' ||
    !Number.isFinite(v.scale) ||
    v.scale < 0.5 ||
    v.scale > 3
  )
    throw new Error('Invalid provider preferences');
  const p = providerDefaults();
  for (const key of [
    'sevenTVEventAPI',
    'images',
    'zeroWidth',
    'stackBits',
    'scaleEmotesByLineHeight',
    'showUnlistedSevenTV',
    'removeSpacesBetweenEmotes',
  ] as const) {
    if (v[key] !== undefined) {
      if (typeof v[key] !== 'boolean') throw new Error('Invalid emote presentation preference');
      p[key] = v[key];
    }
  }
  if (v.tooltipScale !== undefined) {
    if (typeof v.tooltipScale !== 'number' || ![0.5, 1, 1.5, 2].includes(v.tooltipScale))
      throw new Error('Invalid emote tooltip scale');
    p.tooltipScale = v.tooltipScale;
  }
  if (v.ffzRoleArtwork !== undefined) {
    if (
      !record(v.ffzRoleArtwork) ||
      typeof v.ffzRoleArtwork.moderator !== 'boolean' ||
      typeof v.ffzRoleArtwork.vip !== 'boolean'
    )
      throw new Error('Invalid FFZ role artwork preferences');
    p.ffzRoleArtwork = { moderator: v.ffzRoleArtwork.moderator, vip: v.ffzRoleArtwork.vip };
  }
  if (v.cosmetics !== undefined) {
    if (!record(v.cosmetics) || typeof v.cosmetics.FFZ !== 'boolean' || typeof v.cosmetics.Chatterino !== 'boolean')
      throw new Error('Invalid cosmetic preferences');
    p.cosmetics.FFZ = v.cosmetics.FFZ;
    p.cosmetics.Chatterino = v.cosmetics.Chatterino;
    for (const name of ['BTTV', '7TV'] as const) {
      if (v.cosmetics[name] !== undefined) {
        if (typeof v.cosmetics[name] !== 'boolean') throw new Error('Invalid live cosmetic preferences');
        p.cosmetics[name] = v.cosmetics[name];
      }
    }
  }
  if (v.activity !== undefined) {
    if (!record(v.activity) || typeof v.activity.BTTV !== 'boolean' || typeof v.activity['7TV'] !== 'boolean')
      throw new Error('Invalid provider activity preferences');
    p.activity = { BTTV: v.activity.BTTV, '7TV': v.activity['7TV'] };
  }
  p.animated = v.animated;
  p.scale = v.scale;
  for (const provider of PROVIDERS) {
    const entry = v.providers[provider];
    if (!record(entry)) throw new Error('Missing provider preferences');
    for (const key of ['global', 'channel', 'live'] as const) {
      if (typeof entry[key] !== 'boolean') throw new Error('Provider options must be boolean');
      p.providers[provider][key] = entry[key];
    }
  }
  for (const category of BADGE_CATEGORIES) {
    if (typeof v.badges[category] !== 'boolean') throw new Error('Badge options must be boolean');
    p.badges[category] = v.badges[category];
  }
  return p;
}
let current = providerDefaults();
export function getProviderPreferences(): ProviderPreferences {
  return current;
}
export function setProviderPreferences(v: ProviderPreferences): void {
  current = parseProviderPreferences(v);
}
export function badgeCategory(set: string): BadgeCategory {
  if (['staff', 'admin', 'global_mod', 'twitchbot', 'partner'].includes(set)) return 'globalAuthority';
  if (['broadcaster', 'moderator', 'vip', 'lead_moderator'].includes(set)) return 'channelAuthority';
  if (['subscriber', 'founder'].includes(set)) return 'subscription';
  if (set === 'predictions') return 'predictions';
  return 'vanity';
}
export function showBadge(set: string): boolean {
  return current.badges[badgeCategory(set)];
}
export function selectProviderMetadata(data: ChannelMetadata, p: ProviderPreferences): ChannelMetadata {
  const emotes: Record<string, Emote> = Object.create(null) as Record<string, Emote>;
  if (data.emoteSets) {
    for (const set of data.emoteSets)
      if (p.providers[set.provider][set.scope]) {
        for (const [code, e] of Object.entries(set.emotes)) if (!e.unlisted || p.showUnlistedSevenTV) emotes[code] = e;
      }
  } else {
    for (const [code, e] of Object.entries(data.emotes)) {
      const provider = PROVIDERS.find((value) => e.source.startsWith(value));
      if (
        provider &&
        p.providers[provider].global &&
        p.providers[provider].channel &&
        (!e.unlisted || p.showUnlistedSevenTV)
      )
        emotes[code] = e;
    }
  }
  return { ...data, emotes };
}
// With live refresh off, retain each already-seen provider until an explicit reload.
export function reconcileProviderMetadata(
  data: ChannelMetadata,
  previous: ChannelMetadata | undefined,
  p: ProviderPreferences,
  manual = false,
): ChannelMetadata {
  if (!data.emoteSets || !previous?.emoteSets || manual) return data;
  return {
    ...data,
    emoteSets: data.emoteSets.map((set) =>
      !p.providers[set.provider].live
        ? (previous.emoteSets?.find((old) => old.provider === set.provider && old.scope === set.scope) ?? set)
        : set,
    ),
  };
}
export class ProviderPreferenceStore {
  private account = getProfileScope();
  private key = profileKey('chatthing:v1:provider-preferences');
  private raw = localStorage.getItem(this.key);
  read(): ProviderPreferences {
    if (this.account !== getProfileScope()) throw new Error('Account changed; reopen provider preferences');
    if (this.raw && this.raw.length > 8192) throw new Error('Provider preferences exceed limit');
    return parseProviderPreferences(this.raw ? JSON.parse(this.raw) : null);
  }
  save(p: ProviderPreferences): void {
    this.read();
    if (localStorage.getItem(this.key) !== this.raw)
      throw new Error('Provider preferences changed in another tab; reopen');
    const raw = JSON.stringify(parseProviderPreferences(p));
    localStorage.setItem(this.key, raw);
    this.raw = raw;
  }
}
export function restoreProviderPreferences(): void {
  setProviderPreferences(providerDefaults());
  setProviderPreferences(new ProviderPreferenceStore().read());
}
