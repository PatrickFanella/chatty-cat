import {
  LinkPreferenceStore,
  getLinkPreferences,
  linkDefaults,
  parseLinkPreferences,
  setLinkPreferences,
  type LinkPreferences,
} from '../../link-preferences';
import type { Control, SettingDef } from '../registry';
import type { SettingsHost } from '../host';

type Key = Exclude<keyof LinkPreferences, 'version'>;

export const LINK_EXCLUDED = ['version'] as const;

const FIELDS: [Key, string, Control][] = [
  ['enabled', 'Allow automatic remote link previews', { kind: 'toggle' }],
  ['tooltip', 'Show automatic link tooltips on hover/focus', { kind: 'toggle' }],
  ['thumbnails', 'Allow remote link thumbnails and icons', { kind: 'toggle' }],
  ['doubleClick', 'Require double-click to open chat links (Enter still works)', { kind: 'toggle' }],
  ['unshorten', 'Enable explicit shortened-link resolution', { kind: 'toggle' }],
  ['lowercaseDomains', 'Display normalized lowercase domains', { kind: 'toggle' }],
  ['emoteTooltip', 'Show emote and badge tooltip images', { kind: 'toggle' }],
  ['searchEnabled', 'Enable reviewed selection search', { kind: 'toggle' }],
  ['thumbnailSize', 'General preview image width', { kind: 'number', min: 80, max: 640, step: 1, unit: 'px' }],
  ['streamSize', 'Stream preview image width', { kind: 'number', min: 80, max: 640, step: 1, unit: 'px' }],
  ['engineURL', 'Search engine URL with {query}', { kind: 'text', maxLength: 2048 }],
  ['engineName', 'Search engine name', { kind: 'text', maxLength: 40 }],
];

export function linkSettings(host: SettingsHost): SettingDef[] {
  return FIELDS.map(([key, label, control]) => ({
    id: `links.${key}`,
    page: 'general',
    section: 'Links and cards',
    label,
    control,
    private: true,
    read: () => getLinkPreferences()[key],
    defaultValue: () => linkDefaults[key],
    write(value) {
      let patch: unknown = value;
      if (control.kind === 'number') {
        patch = Math.min(control.max, Math.max(control.min, Math.round(Number(value))));
      } else if (control.kind === 'text') {
        const text = String(value);
        const entered = key === 'engineName' ? text.trim() : text;
        const parsed = parseLinkPreferences({ ...getLinkPreferences(), [key]: text });
        if (parsed[key] !== entered) throw new Error('Not a valid value');
      }
      const next = parseLinkPreferences({ ...getLinkPreferences(), [key]: patch });
      new LinkPreferenceStore().save(next);
      setLinkPreferences(next);
      document.dispatchEvent(new Event('presentation-before-change'));
      document.dispatchEvent(new Event('linkpreferenceschange'));
      host.rerender();
    },
  }));
}
