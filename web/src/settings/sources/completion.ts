import {
  CompletionPreferenceStore,
  completionDefaults,
  getCompletionPreferences,
  parseCompletionPreferences,
  setCompletionPreferences,
  type CompletionPreferences,
} from '../../completion-preferences';
import type { Control, SettingDef } from '../registry';
import type { SettingsHost } from '../host';

type Key = Exclude<keyof CompletionPreferences, 'version'>;

export const COMPLETION_EXCLUDED = ['version'] as const;

const FIELDS: [Key, string, Control][] = [
  [
    'mode',
    'Completion matching',
    {
      kind: 'choice',
      options: [
        { value: 'prefix', label: 'Prefix' },
        { value: 'fuzzy', label: 'Fuzzy subsequence' },
      ],
    },
  ],
  ['bareNames', 'Include known users in bare Tab completion', { kind: 'toggle' }],
  ['appendSpace', 'Append a space when completing', { kind: 'toggle' }],
  ['mentionAt', 'Include @ before completed users', { kind: 'toggle' }],
  ['mentionComma', 'Append a comma after completed users', { kind: 'toggle' }],
  ['spellcheck', 'Use browser spellcheck', { kind: 'toggle' }],
  ['smartEmotes', 'Prioritize configured emote codes', { kind: 'toggle' }],
  ['emoteWithColon', 'Enable colon emote completion', { kind: 'toggle' }],
  ['usernameMenu', 'Show username completion menu while typing', { kind: 'toggle' }],
  ['includeBroadcaster', 'Always include the current broadcaster login', { kind: 'toggle' }],
  ['fetchChatters', 'Enable permission-checked chatter reads for completion', { kind: 'toggle' }],
  ['onlySmall', 'Read chatters only below the viewer threshold', { kind: 'toggle' }],
  ['viewerLimit', 'Chatter read viewer threshold', { kind: 'number', min: 1, max: 100000, step: 1 }],
  [
    'aliases',
    'Local nicknames (one login=alias per line)',
    { kind: 'text', multiline: true, maxLength: 16384, placeholder: 'alice=Friend' },
  ],
  [
    'emotePriority',
    'Preferred emote codes (comma-separated)',
    { kind: 'text', maxLength: 8192, placeholder: 'Kappa, PogChamp' },
  ],
];

function format(key: Key, p: CompletionPreferences): unknown {
  if (key === 'aliases') return p.aliases.map((x) => `${x.login}=${x.alias}`).join('\n');
  if (key === 'emotePriority') return p.emotePriority.join(', ');
  return p[key];
}

function parseText(key: Key, value: unknown): unknown {
  const text = String(value);
  if (key === 'aliases') {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const at = line.indexOf('=');
        if (at < 1) throw new Error('Not a valid value');
        return { login: line.slice(0, at).trim(), alias: line.slice(at + 1).trim() };
      });
  }
  return text
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

export function completionSettings(host: SettingsHost): SettingDef[] {
  return FIELDS.map(([key, label, control]) => ({
    id: `completion.${key}`,
    page: 'commands',
    section: 'Completion',
    label,
    control,
    private: true,
    read: () => format(key, getCompletionPreferences()),
    defaultValue: () => format(key, completionDefaults),
    write(value) {
      let patch: unknown = value;
      if (control.kind === 'number') {
        patch = Math.min(control.max, Math.max(control.min, Math.round(Number(value))));
      } else if (control.kind === 'text') {
        patch = parseText(key, value);
      }
      const next = parseCompletionPreferences({ ...getCompletionPreferences(), [key]: patch });
      new CompletionPreferenceStore().save(next);
      setCompletionPreferences(next);
      document.dispatchEvent(new Event('presentation-before-change'));
      document.dispatchEvent(new Event('completionpreferenceschange'));
      host.rerender();
    },
  }));
}
