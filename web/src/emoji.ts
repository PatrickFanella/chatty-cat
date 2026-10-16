import { EMOJIS, EMOJI_GROUPS, EMOJI_VERSION, type CatalogEmoji } from './emoji-catalog';
import { EMOJI_DATA_URL } from './emoji-data-source';
import { referenceData } from './reference-data';
export { EMOJIS, EMOJI_GROUPS, EMOJI_VERSION };
export let EMOJI_CATALOG: readonly CatalogEmoji[] = [];
export let EMOJI_KW: Readonly<Record<string, string>> = {};
let catalog = new Map<string, CatalogEmoji>();
export const loadEmojiCatalog = referenceData(EMOJI_DATA_URL, (value) => {
  if (!value || typeof value !== 'object') throw new Error('Invalid emoji data');
  const data = value as Record<string, unknown>;
  if (data.version !== EMOJI_VERSION || !Array.isArray(data.entries) || data.entries.length !== EMOJIS.length)
    throw new Error('Invalid emoji catalog');
  const legacy =
    data.legacyKeywords && typeof data.legacyKeywords === 'object'
      ? (data.legacyKeywords as Record<string, unknown>)
      : {};
  const codes = new Set(EMOJIS);
  const entries: CatalogEmoji[] = data.entries.map((raw: unknown) => {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid emoji entry');
    const row = raw as Record<string, unknown>;
    if (
      typeof row.code !== 'string' ||
      !codes.delete(row.code) ||
      !['name', 'group', 'subgroup', 'version', 'asset'].every(
        (key) => typeof row[key] === 'string' && (row[key] as string).length <= 300,
      ) ||
      !EMOJI_GROUPS.includes(row.group as string) ||
      !/^[a-f0-9]+(?:-[a-f0-9]+)*\.svg$/.test(row.asset as string) ||
      !Array.isArray(row.tones) ||
      !row.tones.every((tone) => typeof tone === 'string' && /^1f3f[b-f]$/.test(tone))
    )
      throw new Error('Invalid emoji entry');
    return row as unknown as CatalogEmoji;
  });
  const keywords = Object.fromEntries(
    entries.map((entry) => [
      entry.code,
      [
        entry.name,
        entry.group,
        entry.subgroup,
        'Unicode ' + entry.version,
        typeof legacy[entry.code] === 'string' ? legacy[entry.code] : '',
      ].join(' '),
    ]),
  );
  EMOJI_CATALOG = entries;
  EMOJI_KW = keywords;
  catalog = new Map(entries.map((entry) => [entry.code, entry]));
  document.dispatchEvent(new Event('emojicatalogchange'));
  if (style !== 'native') document.dispatchEvent(new Event('emojistylechange'));
  return entries;
});
export function emojiCatalogLoaded(): boolean {
  return catalog.size === EMOJIS.length;
}
export function emojiEntry(code: string) {
  return catalog.get(code);
}
export function emojiImage(code: string): string | undefined {
  const entry = emojiEntry(code);
  return entry ? '/emoji/twemoji-17.0.3/' + entry.asset : undefined;
}
export type EmojiStyle = 'native' | 'image' | 'labels';
let style: EmojiStyle = 'native';
export function setEmojiStyle(value: EmojiStyle): void {
  if (value !== style) {
    style = value;
    if (style !== 'native')
      void loadEmojiCatalog().catch(() => {
        /* Native text remains available; picker offers retry. */
      });
    document.dispatchEvent(new Event('emojistylechange'));
  }
}
export function getEmojiStyle(): EmojiStyle {
  return style;
}
const pattern = new RegExp(
  [...EMOJIS]
    .sort((a, b) => b.length - a.length)
    .map((code) => code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|'),
  'gu',
);
export function observedEmoji(text: string): string[] {
  return [...text.matchAll(pattern)].map((match) => match[0]);
}
export function emojiNode(code: string, presentation: EmojiStyle = style): Node {
  const entry = emojiEntry(code);
  if (!entry || presentation === 'native') return document.createTextNode(code);
  const label = (): HTMLSpanElement => {
    const span = document.createElement('span');
    span.className = 'emoji-label';
    span.textContent = '[' + entry.name + ']';
    span.title =
      code + ' · ' + [...code].map((char) => 'U+' + char.codePointAt(0)?.toString(16).toUpperCase()).join(' ');
    return span;
  };
  if (presentation === 'labels') return label();
  const image = document.createElement('img');
  image.className = 'emoji-image';
  image.src = '/emoji/twemoji-17.0.3/' + entry.asset;
  image.alt = code + ' · ' + entry.name;
  image.title = entry.name + ' · Unicode ' + entry.version;
  image.dataset.emojiCode = code;
  image.loading = 'lazy';
  image.decoding = 'async';
  image.referrerPolicy = 'no-referrer';
  image.style.width = '1.25em';
  image.style.height = '1.25em';
  image.style.verticalAlign = 'middle';
  image.addEventListener('error', () => image.replaceWith(label()), { once: true });
  return image;
}
export function appendEmojiText(root: HTMLElement, text: string): void {
  if (style === 'native') {
    root.append(document.createTextNode(text));
    return;
  }
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    root.append(document.createTextNode(text.slice(offset, match.index)), emojiNode(match[0]));
    offset = match.index + match[0].length;
  }
  root.append(document.createTextNode(text.slice(offset)));
}
