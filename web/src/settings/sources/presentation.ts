import { getCompletionPreferences } from '../../completion-preferences';
import {
  parsePresentation,
  presentationDefaults,
  presentationFields,
  type PresentationOptions,
} from '../../presentation';
import type { Control, PageId, SettingDef } from '../registry';
import type { SettingsHost } from '../host';

type Key = keyof PresentationOptions;

/** Keys represented by display or completion controls, or not user-facing. */
export const PRESENTATION_EXCLUDED: readonly Key[] = [
  'hideSettings',
  'showTimestamps',
  'timestampFormat',
  'separators',
  'alternating',
  'mentionAt',
  'mentionComma',
];

const CHOICE_LABELS: Record<string, string> = {
  login: 'Login name',
  localized: 'Localized name',
  both: 'Both',
  usercard: 'Usercard menu',
  none: 'None',
  ctrl: 'Ctrl',
  meta: 'Meta',
};

function labelFor(value: string): string {
  const known = CHOICE_LABELS[value];
  if (known) return known;
  return /^[a-z]+$/.test(value) ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function controlFor(key: Key): Control {
  const field = presentationFields[key];
  const sample = presentationDefaults[key];
  if (field.choices)
    return { kind: 'choice', options: field.choices.map((value) => ({ value, label: labelFor(value) })) };
  if (key === 'lastColor' || key === 'overlayShadowColor') return { kind: 'color' };
  if (key === 'mutedChannels') return { kind: 'text', maxLength: 1000, placeholder: 'Comma-separated channel logins' };
  if (typeof sample === 'boolean') return { kind: 'toggle' };
  return { kind: 'number', min: field.min ?? 0, max: field.max ?? 1, step: field.step ?? 1 };
}

type Spec = [page: PageId, section: string, keys: Key[]];

const SPECS: Spec[] = [
  ['general', 'Appearance', ['uiScale', 'boldScale', 'tooltipDelay']],
  ['general', 'Links and cards', ['autoCloseUserPopup', 'autoCloseThreadPopup', 'usercardHover']],
  [
    'general',
    'Messages',
    [
      'messageActions',
      'hideReplyUsername',
      'usernameMode',
      'boldUsernames',
      'colorUsernames',
      'colorMentions',
      'findAllUsernames',
      'collapseLines',
      'deletedLength',
      'fadeHistory',
      'lastMessage',
      'lastPattern',
      'lastColor',
      'showJoins',
      'showParts',
      'showPronouns',
      'loadHistory',
      'historyLimit',
    ],
  ],
  ['general', 'Emotes', ['animateOnlyFocused']],
  [
    'general',
    'Scrolling',
    [
      'paneScrollback',
      'scrollMultiplier',
      'smoothScroll',
      'smoothNew',
      'pauseHoverSeconds',
      'pauseModifier',
      'markers',
      'hideScrollbar',
    ],
  ],
  ['general', 'Composer', ['showSendButton', 'showLength', 'showWait', 'showEmptyInput', 'overflow', 'pulseSelf']],
  ['general', 'Layout', ['headerViewers', 'headerTitle', 'headerUptime', 'headerGame']],
  [
    'general',
    'Overlay',
    [
      'overlayBackgroundOpacity',
      'overlayShadow',
      'overlayShadowOpacity',
      'overlayShadowColor',
      'overlayShadowOffsetX',
      'overlayShadowOffsetY',
      'overlayShadowRadius',
    ],
  ],
  ['accounts', 'Accounts', ['hideAccount']],
  [
    'ignores',
    'Ignores',
    [
      'hideModerated',
      'hideModerationActions',
      'hideDeletionActions',
      'hideReplyContext',
      'showReplyButton',
      'stripReplyMention',
    ],
  ],
  ['hotkeys', 'Mouse', ['rightClick', 'modifiedRightClick', 'rightClickModifier']],
  ['notifications', 'Muted channels', ['mutedChannels']],
];

export function presentationSettings(host: SettingsHost): SettingDef[] {
  const defs: SettingDef[] = [];
  for (const [page, section, keys] of SPECS) {
    for (const key of keys) {
      const def: SettingDef = {
        id: `presentation.${key}`,
        page,
        section,
        label: presentationFields[key].label,
        control: controlFor(key),
        private: true,
        read: () => host.presentation.saved[key],
        defaultValue: () => presentationDefaults[key],
        write(value) {
          const sample = presentationDefaults[key];
          const next = typeof sample === 'number' ? Number(value) : value;
          const completion = getCompletionPreferences();
          const parsed = parsePresentation({
            ...host.presentation.saved,
            [key]: next,
            mentionAt: completion.mentionAt,
            mentionComma: completion.mentionComma,
          });
          // The parser falls back to the default for rejected text; refuse it instead of saving that.
          if (key === 'mutedChannels' && parsed.mutedChannels !== normalizeChannels(String(value)))
            throw new Error('Not a valid value');
          host.presentation.persist(parsed);
          host.rerender();
        },
      };
      if (section === 'Overlay') def.visible = () => host.overlay;
      defs.push(def);
    }
  }
  return defs;
}

/** The same normalisation parsePresentation applies to an accepted channel list. */
function normalizeChannels(text: string): string {
  return [
    ...new Set(
      text
        .toLowerCase()
        .split(/[\s,]+/)
        .filter(Boolean),
    ),
  ].join(',');
}
