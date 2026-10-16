// Labels belong to the editor. Values remain the legacy storage/URL contract.
export const DISPLAY_OPTION_LABELS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  min: { 0: 'Full header', 1: 'Compact header', 2: 'Graph header' },
  bauto: { 0: 'Always visible', 1: 'Fade until hovered or focused', 2: 'Collapse until hovered or focused' },
  peek: { 0: 'Off', 1: 'Text cards', 2: 'Cards with images and players', 3: 'Compact cards' },
  split: {
    1: 'One chat column',
    2: 'Two chat columns',
    3: 'Three columns (two in portrait)',
    4: 'Chat + video, emotes and stats',
    5: 'Chat + video and emotes',
    6: 'Chat + emotes',
  },
  sub: {
    right: 'Full label on the right',
    'num-right': 'Number on the right',
    left: 'Full label on the left',
    'num-left': 'Number on the left',
    hidden: 'Hidden',
  },
  eonly: { 0: 'Enlarged emotes', 1: 'Enlarged emotes aligned right', 2: 'Normal emote size' },
  hideMode: { vanish: 'Remove the message', stub: 'Show a hidden-message label', ghost: 'Dim the message' },
  lines: { 0: 'Off', 1: 'Subtle (25%)', 2: 'Medium (50%)', 3: 'Strong (75%)', 4: 'Full (100%)' },
  zebra: { 0: 'Off', 1: 'Subtle (20%)', 2: 'Light (40%)', 3: 'Medium (60%)', 4: 'Strong (80%)' },
  times: {
    0: 'Hidden',
    1: '24-hour · hours and minutes',
    2: '24-hour · hours, minutes and seconds',
    3: '12-hour · hours and minutes',
    4: '12-hour · hours, minutes and seconds',
  },
  shadow: {
    0: 'None',
    1: 'Soft text-colored shadow',
    2: 'Medium text-colored shadow',
    3: 'Strong text-colored shadow',
    4: 'Dark shadow',
    5: 'Strong dark shadow',
  },
  anim: { 0: 'Off', 1: 'Slow', 2: 'Medium', 3: 'Fast' },
  rbw: { 0: 'Sweep', 1: 'Wave', 2: 'Hue rotation', 3: 'Pulse', 4: 'Flicker' },
  weight: { 300: 'Light (300)', 400: 'Regular (400)', 500: 'Medium (500)', 600: 'Semibold (600)', 700: 'Bold (700)' },
  lw: { 300: 'Light (300)', 400: 'Regular (400)', 500: 'Medium (500)', 600: 'Semibold (600)', 700: 'Bold (700)' },
  hfs: { 0: 'Follow chat font size' },
  hpfs: {
    0: 'Follow chat font size',
    '-1': 'One size step smaller than chat',
    '-2': 'Two size steps smaller than chat',
    '-3': 'Three size steps smaller than chat',
  },
  font: {
    roobert: 'Roobert',
    inter: 'Inter',
    sans: 'System sans-serif',
    sourcesans: 'Source Sans 3',
    sourcecodepro: 'Source Code Pro',
    hack: 'Hack',
    firacode: 'Fira Code',
    plexmono: 'IBM Plex Mono',
    mono: 'JetBrains Mono',
    atkinson: 'Atkinson Hyperlegible',
    atkinsonmono: 'Atkinson Hyperlegible Mono',
    lexend: 'Lexend',
    dyslexic: 'OpenDyslexic',
    dyslexicmono: 'OpenDyslexic Mono',
    comicneue: 'Comic Neue',
    vt323: 'VT323',
    fixedsys: 'Fixedsys',
    terminus: 'Terminess',
    gohu: 'Gohu',
    mononoki: 'Mononoki',
    cursed: 'Cursed',
    shantell: 'Shantell Sans',
    vga: 'Web437 VGA',
    glean: 'Glean',
    georgia: 'Georgia',
    times: 'Times New Roman',
    elstob: 'Elstob',
    stl: 'Some Time Later',
    miniwi: 'Some Time Later (legacy Miniwi)',
  },
};

export function displayOptionLabel(field: string, value: string | number): string {
  const mapped = DISPLAY_OPTION_LABELS[field]?.[String(value)];
  if (mapped) return mapped;
  if (['size', 'hfs', 'hpfs'].includes(field)) return `${value} px`;
  if (field === 'lh') return `${value}× font size`;
  if (field === 'spacing') return Number(value) === 0 ? 'Normal (0 em)' : `${value} em`;
  if (field === 'scrollback') return `${value} rows`;
  const text = String(value).replace(/-/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
