import { getProfileScope, profileKey } from './account-profiles';
export interface LinkPreferences {
  version: 1;
  enabled: boolean;
  tooltip: boolean;
  thumbnails: boolean;
  doubleClick: boolean;
  unshorten: boolean;
  lowercaseDomains: boolean;
  emoteTooltip: boolean;
  thumbnailSize: number;
  streamSize: number;
  searchEnabled: boolean;
  engineURL: string;
  engineName: string;
}
export const linkDefaults: LinkPreferences = {
  version: 1,
  enabled: false,
  tooltip: false,
  thumbnails: false,
  doubleClick: false,
  unshorten: false,
  lowercaseDomains: true,
  emoteTooltip: false,
  thumbnailSize: 240,
  streamSize: 360,
  searchEnabled: false,
  engineURL: 'https://duckduckgo.com/?q={query}',
  engineName: 'DuckDuckGo',
};
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export function parseLinkPreferences(value: unknown): LinkPreferences {
  if (value === null) return { ...linkDefaults };
  if (!record(value) || value.version !== 1) throw new Error('Invalid link preferences');
  const p = { ...linkDefaults };
  for (const key of [
    'enabled',
    'tooltip',
    'thumbnails',
    'doubleClick',
    'unshorten',
    'lowercaseDomains',
    'emoteTooltip',
    'searchEnabled',
  ] as const) {
    if (typeof value[key] !== 'boolean') throw new Error('Link options must be boolean');
    p[key] = value[key];
  }
  for (const key of ['thumbnailSize', 'streamSize'] as const) {
    if (typeof value[key] !== 'number' || !Number.isInteger(value[key]) || value[key] < 80 || value[key] > 640)
      throw new Error('Preview sizes must be 80–640 px');
    p[key] = value[key];
  }
  if (
    typeof value.engineURL !== 'string' ||
    value.engineURL.length > 2048 ||
    value.engineURL.split('{query}').length !== 2 ||
    /[\x00-\x20<>]/.test(value.engineURL) ||
    value.engineURL.replace('{query}', '').includes('{')
  )
    throw new Error('Use one {query} placeholder in an HTTP(S) search URL');
  const url = new URL(value.engineURL.replace('{query}', 'fixture'));
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname)
    throw new Error('Invalid search engine URL');
  if (
    typeof value.engineName !== 'string' ||
    !value.engineName.trim() ||
    value.engineName.length > 40 ||
    /[\x00-\x1f\x7f]/.test(value.engineName)
  )
    throw new Error('Invalid search engine name');
  p.engineURL = value.engineURL;
  p.engineName = value.engineName.trim();
  return p;
}
let current = { ...linkDefaults };
export function getLinkPreferences(): LinkPreferences {
  return current;
}
export function setLinkPreferences(value: LinkPreferences): void {
  current = parseLinkPreferences(value);
}
export function searchURL(p: LinkPreferences, text: string): string {
  if (!p.searchEnabled || !text.trim() || text.length > 1000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text))
    throw new Error('Select 1–1,000 public chat characters first');
  return p.engineURL.replace('{query}', encodeURIComponent(text.trim()));
}
export class LinkPreferenceStore {
  private account = getProfileScope();
  private key = profileKey('chatthing:v1:link-preferences');
  private raw: string | null;
  constructor() {
    this.raw = localStorage.getItem(this.key);
  }
  read(): LinkPreferences {
    if (getProfileScope() !== this.account) throw new Error('Account changed; reopen link preferences');
    if (this.raw && this.raw.length > 8192) throw new Error('Saved link preferences exceed limit');
    return parseLinkPreferences(this.raw ? JSON.parse(this.raw) : null);
  }
  save(value: LinkPreferences): void {
    this.read();
    if (localStorage.getItem(this.key) !== this.raw) throw new Error('Link preferences changed in another tab; reopen');
    const raw = JSON.stringify(parseLinkPreferences(value));
    localStorage.setItem(this.key, raw);
    this.raw = raw;
  }
}
