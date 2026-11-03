import { defaultDisplay, displayFromURL, firstVisitDisplay, parseDisplay, type DisplayOptions } from '../../display';
import { parsePresentation, type PresentationOptions } from '../../presentation';
import {
  COLOURS,
  FONT_SIZES,
  FONT_STACKS,
  LINE_HEIGHTS,
  LS_STEPS,
  PRESETS,
  SHADE_NAMES,
  VARIANTS,
  WEIGHTS,
} from '../../display-data';
import { displayOptionLabel } from '../../display-option-labels';
import type { Control, PageId, SettingDef } from '../registry';
import type { SettingsHost } from '../host';

/** Keys that are not user settings: `min` is owned by the header toggle. */
export const DISPLAY_EXCLUDED: readonly (keyof DisplayOptions)[] = ['min'];

/** parseDisplay keeps this many characters of a text field. */
const TEXT_LIMIT = 1000;

type Choices = readonly (string | number)[];

function choice(field: string, values: Choices): Control {
  return { kind: 'choice', options: values.map((value) => ({ value, label: displayOptionLabel(field, value) })) };
}

const SHADES = SHADE_NAMES.map((name, index) => ({
  value: index,
  label: name.charAt(0).toUpperCase() + name.slice(1),
}));

const CONTROLS: Partial<Record<keyof DisplayOptions, Control>> = {
  colour: choice('colour', COLOURS),
  variant: choice('variant', VARIANTS),
  shade: { kind: 'choice', options: SHADES },
  font: choice('font', Object.keys(FONT_STACKS)),
  size: choice('size', FONT_SIZES),
  lh: choice('lh', LINE_HEIGHTS),
  weight: choice('weight', WEIGHTS),
  spacing: choice('spacing', LS_STEPS),
  shadow: choice('shadow', [0, 1, 2, 3, 4, 5]),
  lines: choice('lines', [0, 1, 2, 3, 4]),
  zebra: choice('zebra', [0, 1, 2, 3, 4]),
  times: choice('times', [0, 1, 2, 3, 4]),
  sub: choice('sub', ['right', 'num-right', 'left', 'num-left', 'hidden']),
  eonly: choice('eonly', [0, 1, 2]),
  peek: choice('peek', [0, 1, 2, 3]),
  lw: choice('lw', WEIGHTS),
  scrollback: choice('scrollback', [250, 500, 1000, 2000, 5000, 10000, 25000, 50000, 100000]),
  bauto: choice('bauto', [0, 1, 2]),
  split: choice('split', [1, 2, 3, 4, 5, 6]),
  hfs: choice('hfs', [0, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20]),
  hpfs: choice('hpfs', [-3, -2, -1, 0, ...FONT_SIZES]),
  anim: choice('anim', [0, 1, 2, 3]),
  rbw: choice('rbw', [0, 1, 2, 3, 4]),
  hideMode: choice('hideMode', ['vanish', 'stub', 'ghost']),
  keywords: { kind: 'text', maxLength: TEXT_LIMIT, placeholder: 'Comma-separated words' },
  blocked: { kind: 'text', maxLength: TEXT_LIMIT, placeholder: 'Comma-separated words' },
  hidden: { kind: 'text', maxLength: TEXT_LIMIT, placeholder: 'Comma-separated usernames' },
};

// The presentation copy of these display choices follows the display value again once it is changed here.
const PRESENTATION_COPIES: Partial<Record<keyof DisplayOptions, Partial<PresentationOptions>>> = {
  times: { showTimestamps: true, timestampFormat: 'legacy' },
  lines: { separators: 'legacy' },
  zebra: { alternating: 'legacy' },
};

type Spec = [page: PageId, section: string, items: [key: keyof DisplayOptions, label: string][]];

const SPECS: Spec[] = [
  [
    'general',
    'Appearance',
    [
      ['colour', 'Colour'],
      ['variant', 'Finish'],
      ['shade', 'Shade'],
      ['autoShade', 'Follow system light/dark'],
    ],
  ],
  [
    'general',
    'Font',
    [
      ['font', 'Font'],
      ['size', 'Size'],
      ['lh', 'Line height'],
      ['weight', 'Weight'],
      ['spacing', 'Letter spacing'],
      ['shadow', 'Text shadow'],
    ],
  ],
  [
    'general',
    'Messages',
    [
      ['lines', 'Separators'],
      ['zebra', 'Zebra'],
      ['times', 'Timestamps'],
      ['sub', 'Subscriber months'],
      ['rev', 'Newest messages at top'],
      ['cmodes', 'Show room modes'],
      ['stitle', 'Stream title/status bar'],
    ],
  ],
  ['general', 'Emotes', [['eonly', 'Emote-only size']]],
  [
    'general',
    'Links and cards',
    [
      ['peek', 'Link and profile cards'],
      ['yt', 'YouTube players'],
      ['gifsafe', 'Limit GIF lookup to PG-13'],
      ['lkico', 'Link favicons'],
      ['lw', 'Resource link weight'],
      ['links', 'Links only (first matching post)'],
      ['pn', 'Pronouns on profile cards'],
      ['clean', 'Clean link labels'],
    ],
  ],
  [
    'general',
    'Scrolling',
    [
      ['scrollback', 'Scrollback rows'],
      ['pause', 'Pause follow on hover'],
    ],
  ],
  [
    'general',
    'Composer',
    [
      ['bauto', 'Composer autohide'],
      ['bartop', 'Composer under header'],
    ],
  ],
  [
    'general',
    'Layout',
    [
      ['split', 'Columns and rail'],
      ['hfs', 'Header font size'],
      ['hpfs', 'Help font size'],
      ['lbls', 'Header button labels'],
    ],
  ],
  [
    'general',
    'Motion',
    [
      ['anim', 'Nick shimmer'],
      ['rbw', 'Rainbow motion'],
    ],
  ],
  [
    'highlights',
    'Highlights',
    [
      ['keywords', 'Highlight words'],
      ['self', 'Highlight my name'],
      ['ping', 'Mention sound while away'],
    ],
  ],
  [
    'ignores',
    'Ignores',
    [
      ['blocked', 'Blocked words'],
      ['hidden', 'Hidden users'],
      ['hideMode', 'Hidden-user mode'],
      ['nbots', 'Hide known bots'],
    ],
  ],
  ['notifications', 'Desktop alerts', [['notify', 'Mention and live notifications']]],
];

export function displaySettings(host: SettingsHost): SettingDef[] {
  const save = (patch: Partial<DisplayOptions>): void => host.display.setOptions({ ...host.display.options, ...patch });

  const defs: SettingDef[] = [];
  for (const [page, section, items] of SPECS) {
    for (const [key, label] of items) {
      const sample = defaultDisplay()[key];
      const control: Control = CONTROLS[key] ?? { kind: 'toggle' };
      defs.push({
        id: `display.${key}`,
        page,
        section,
        label,
        control,
        private: true,
        read: () => host.display.options[key],
        defaultValue: () => firstVisitDisplay()[key],
        write(value) {
          const next = typeof sample === 'number' ? Number(value) : value;
          const patch: Partial<DisplayOptions> = { [key]: next };
          if (key === 'shade') patch.autoShade = false;
          // The parser keeps only strings (truncated); refuse anything it would replace.
          if (
            control.kind === 'text' &&
            parseDisplay({ ...host.display.options, ...patch })[key] !== String(value).slice(0, TEXT_LIMIT)
          )
            throw new Error('Not a valid value');
          const wasOn = host.display.options.notify;
          save(patch);
          const copy = PRESENTATION_COPIES[key];
          if (copy) host.presentation.persist(parsePresentation({ ...host.presentation.saved, ...copy }));
          if (key === 'notify' && next === true && !wasOn) void host.attention.permission();
        },
      });
    }
  }
  const appearance = defs.findIndex((d) => d.id === 'display.autoShade') + 1;
  defs.splice(appearance, 0, {
    id: 'display.preset',
    page: 'general',
    section: 'Appearance',
    label: 'Preset',
    hint: 'Applies a full set of display values at once.',
    keywords: 'theme preset',
    control: {
      kind: 'choice',
      placeholder: 'Choose a preset…',
      options: Object.keys(PRESETS).map((value) => ({ value, label: displayOptionLabel('preset', value) })),
    },
    private: true,
    read: () => '',
    defaultValue: () => 'nightshade',
    write(value) {
      host.display.setOptions(displayFromURL(host.display.options, new URLSearchParams({ theme: String(value) })));
      // The emote picker applies its matching preset.
      document.dispatchEvent(new CustomEvent('displaypreset', { detail: String(value) }));
    },
  });
  return defs;
}
