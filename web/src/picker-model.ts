import { profileKey } from './account-profiles';
import { PRESETS } from './display-data';
import { AGE_SECONDS, familyCompare } from './picker-order';
import { PickerCoverage } from './picker-coverage';
import { EMOJIS, EMOJI_KW, EMOJI_GROUPS, emojiEntry, observedEmoji, setEmojiStyle } from './emoji';
import { tokenize, type Emote } from './tokens';
import type { ChatMessage, ConnectionState } from './protocol';

export const SOURCES = ['Twitch', '7TV', 'BTTV', 'FFZ', 'Emoji'] as const;
export type Source = (typeof SOURCES)[number];
export interface PickerItem {
  code: string;
  source: Source;
  emote?: Emote;
  keywords: string;
}
export interface PickerOptions {
  emojiStyle: 'native' | 'image' | 'labels';
  emojiCategory: string;
  emojiTone: string;
  enabled: Source[];
  mixed: boolean;
  sort: 'use' | 'az';
  animation: 'all' | 'animated' | 'still';
  seenOnly: boolean;
  ages: boolean;
  ageRows: number;
  names: boolean;
  zoom: number;
  hold: boolean;
  holdPlus: boolean;
  frozen: boolean;
}
export const defaultOptions = (): PickerOptions => ({
  emojiStyle: 'native',
  emojiCategory: 'all',
  emojiTone: 'all',
  enabled: [...SOURCES],
  mixed: false,
  sort: 'use',
  animation: 'all',
  seenOnly: false,
  ages: true,
  ageRows: 0,
  names: true,
  zoom: 1,
  hold: true,
  holdPlus: true,
  frozen: false,
});
export function parseOptions(value: unknown): PickerOptions {
  const result = defaultOptions();
  if (!value || typeof value !== 'object') return result;
  const data = value as Record<string, unknown>;
  if (Array.isArray(data.enabled))
    result.enabled = SOURCES.filter((source) => (data.enabled as unknown[]).includes(source));
  for (const key of ['mixed', 'names', 'hold', 'holdPlus', 'frozen', 'seenOnly', 'ages'] as const)
    if (typeof data[key] === 'boolean') result[key] = data[key];
  if ([0, 1, 2].includes(Number(data.ageRows)) && typeof data.ageRows === 'number') result.ageRows = data.ageRows;
  if (data.sort === 'use' || data.sort === 'az') result.sort = data.sort;
  if (data.animation === 'all' || data.animation === 'animated' || data.animation === 'still')
    result.animation = data.animation;
  if (typeof data.zoom === 'number' && [0.5, 0.75, 1, 4 / 3, 1.5, 5 / 3, 2].includes(data.zoom))
    result.zoom = data.zoom;
  if (data.emojiStyle === 'native' || data.emojiStyle === 'image' || data.emojiStyle === 'labels')
    result.emojiStyle = data.emojiStyle;
  if (
    typeof data.emojiCategory === 'string' &&
    (data.emojiCategory === 'all' || EMOJI_GROUPS.includes(data.emojiCategory))
  )
    result.emojiCategory = data.emojiCategory;
  if (
    typeof data.emojiTone === 'string' &&
    ['all', 'none', '1f3fb', '1f3fc', '1f3fd', '1f3fe', '1f3ff', 'mixed'].includes(data.emojiTone)
  )
    result.emojiTone = data.emojiTone;
  return result;
}
export function restorePickerOptions(current: PickerOptions, value: unknown): PickerOptions {
  const parsed = parseOptions(value);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return parsed;
  if (!('emojiStyle' in value)) parsed.emojiStyle = current.emojiStyle;
  if (!('emojiCategory' in value)) parsed.emojiCategory = current.emojiCategory;
  if (!('emojiTone' in value)) parsed.emojiTone = current.emojiTone;
  return parsed;
}
function matchesEmoji(item: PickerItem, options: PickerOptions): boolean {
  if (item.source !== 'Emoji') return true;
  const entry = emojiEntry(item.code);
  if (!entry) return options.emojiCategory === 'all' && options.emojiTone === 'all';
  if (options.emojiCategory !== 'all' && entry.group !== options.emojiCategory) return false;
  if (options.emojiTone === 'all') return true;
  if (options.emojiTone === 'none') return !entry.tones.length;
  if (options.emojiTone === 'mixed') return new Set(entry.tones).size > 1;
  return entry.tones.includes(options.emojiTone);
}
function group(source: string): Source | undefined {
  return SOURCES.find((item) => source.startsWith(item));
}
interface Usage {
  count: number;
  last: number;
}
export class PickerModel {
  options = defaultOptions();
  private account: Emote[] = [];
  availableNative(): readonly Emote[] {
    return this.account;
  }
  setAccount(emotes: Emote[]): void {
    this.account = emotes.slice(0, 10000);
  }
  private seeds = new Map<string, Record<string, number>>();
  setSeeds(channel: string, counts: Record<string, number>): void {
    const valid: Record<string, number> = Object.create(null) as Record<string, number>;
    for (const [code, count] of Object.entries(counts).slice(0, 4096))
      if (code.length <= 100 && Number.isSafeInteger(count) && count >= 0) valid[code] = count;
    this.seeds.set(channel, valid);
  }
  private providers = new Map<string, Record<string, Emote>>();
  private native = new Map<string, Map<string, Emote>>();
  private uses = new Map<string, Map<string, Usage>>();
  private recents = new Map<string, string[]>();
  private seen = new Map<string, Set<string>>();
  private loaded = new Set<string>();
  private coverages = new Map<string, PickerCoverage>();
  coverage(channel: string): PickerCoverage {
    this.load(channel);
    const existing = this.coverages.get(channel);
    if (existing) return existing;
    const coverage = new PickerCoverage(undefined);
    this.coverages.set(channel, coverage);
    return coverage;
  }
  connection(channels: readonly string[], state: ConnectionState): void {
    for (const channel of channels) this.coverage(channel).connected(state === 'connected');
  }
  crossedAges(channel: string, now = Date.now()): Set<number> {
    this.load(channel);
    const timestamps = [...(this.uses.get(channel)?.values() ?? [])].map((use) => use.last).sort((a, b) => b - a);
    const coverage = this.coverage(channel);
    return new Set(
      AGE_SECONDS.filter((seconds) => {
        const last = timestamps.find((timestamp) => timestamp <= now - seconds * 1000);
        return last !== undefined && coverage.observed(last + seconds * 1000, now);
      }),
    );
  }
  constructor() {
    try {
      this.options = parseOptions(
        JSON.parse(localStorage.getItem(profileKey('chatthing:v1:picker:options')) ?? 'null'),
      );
    } catch {
      /* optional storage */
    }
    this.options = pickerFromURL(this.options, new URL(location.href).searchParams);
    setEmojiStyle(this.options.emojiStyle);
  }
  setMetadata(channel: string, emotes: Record<string, Emote>): void {
    this.providers.set(channel, emotes);
  }
  catalog(channel: string): PickerItem[] {
    this.load(channel);
    const items = new Map<string, PickerItem>();
    for (const emote of Object.values(this.providers.get(channel) ?? {})) {
      const source = group(emote.source);
      if (source) items.set(emote.code, { code: emote.code, source, emote, keywords: emote.code });
    }
    for (const emote of this.native.get(channel)?.values() ?? [])
      items.set(emote.code, { code: emote.code, source: 'Twitch', emote, keywords: emote.code });
    for (const emote of this.account)
      items.set(emote.code, { code: emote.code, source: 'Twitch', emote, keywords: emote.code });
    for (const code of EMOJIS) items.set(code, { code, source: 'Emoji', keywords: EMOJI_KW[code] ?? code });
    return [...items.values()];
  }
  query(channel: string, search: string): PickerItem[] {
    const q = search.trim().toLowerCase();
    const options = this.options;
    const catalog = this.catalog(channel);
    const use = this.uses.get(channel);
    return catalog
      .filter(
        (item) =>
          options.enabled.includes(item.source) &&
          matchesEmoji(item, options) &&
          (!options.seenOnly || (use?.get(item.code)?.last ?? 0) > 0) &&
          (!q || (item.code + ' ' + item.keywords).toLowerCase().includes(q)) &&
          (options.animation === 'all' || (item.emote?.animated === true) === (options.animation === 'animated')),
      )
      .sort(
        (a, b) =>
          (options.sort === 'use'
            ? (use?.get(b.code)?.last ?? 0) - (use?.get(a.code)?.last ?? 0) ||
              (use?.get(b.code)?.count ?? 0) +
                (this.seeds.get(channel)?.[b.code] ?? 0) -
                ((use?.get(a.code)?.count ?? 0) + (this.seeds.get(channel)?.[a.code] ?? 0))
            : 0) || familyCompare(a.code, b.code),
      );
  }
  lastUse(channel: string, code: string): number {
    this.load(channel);
    return this.uses.get(channel)?.get(code)?.last ?? 0;
  }
  recent(channel: string): PickerItem[] {
    const catalog = new Map(this.query(channel, '').map((item) => [item.code, item]));
    return (this.recents.get(channel) ?? []).flatMap((code) => {
      const item = catalog.get(code);
      return item ? [item] : [];
    });
  }
  select(channel: string, code: string): void {
    this.load(channel);
    this.recents.set(
      channel,
      [code, ...(this.recents.get(channel) ?? []).filter((item) => item !== code)].slice(0, 24),
    );
    this.save(channel);
  }
  observe(message: ChatMessage, live: boolean): string[] {
    if (message.command !== 'PRIVMSG') return [];
    this.load(message.channel);
    const native = this.native.get(message.channel) ?? new Map<string, Emote>();
    const tokens = tokenize(message.text, message.tags.emotes ?? '', this.providers.get(message.channel) ?? {});
    for (const token of tokens)
      if (token.type === 'emote' && token.emote.source === 'Twitch') native.set(token.emote.code, token.emote);
    while (native.size > 1024) {
      const first = native.keys().next().value;
      if (first) native.delete(first);
      else break;
    }
    this.native.set(message.channel, native);
    if (!live) return [];
    const seen = this.seen.get(message.channel) ?? new Set<string>();
    if (message.id && seen.has(message.id)) return [];
    if (message.id) seen.add(message.id);
    while (seen.size > 2500) {
      const first = seen.values().next().value;
      if (first) seen.delete(first);
      else break;
    }
    this.seen.set(message.channel, seen);
    const used = tokens.flatMap((token) => (token.type === 'emote' ? [token.emote.code] : []));
    // Emoji entries include variation selectors and multi-codepoint sequences.
    used.push(...observedEmoji(message.text));
    const uses = this.uses.get(message.channel) ?? new Map<string, Usage>();
    for (const code of new Set(used)) {
      const old = uses.get(code);
      uses.delete(code);
      uses.set(code, { count: (old?.count ?? 0) + 1, last: Math.max(old?.last ?? 0, message.timestamp) });
    }
    while (uses.size > 4096) {
      const first = uses.keys().next().value;
      if (first) uses.delete(first);
      else break;
    }
    this.uses.set(message.channel, uses);
    return [...new Set(used)];
  }
  resetOrder(channel: string): void {
    this.load(channel);
    this.uses.set(channel, new Map());
    this.save(channel);
  }
  saveAll(): void {
    for (const channel of this.loaded) this.save(channel);
  }
  save(channel: string): void {
    this.load(channel);
    setEmojiStyle(this.options.emojiStyle);
    try {
      localStorage.setItem(profileKey('chatthing:v1:picker:options'), JSON.stringify(this.options));
      localStorage.setItem(
        profileKey('chatthing:v1:picker:') + channel,
        JSON.stringify({
          recent: this.recents.get(channel) ?? [],
          uses: [...(this.uses.get(channel) ?? [])].slice(-1000),
          coverage: this.coverage(channel).snapshot(),
        }),
      );
    } catch {
      /* optional storage */
    }
  }
  private load(channel: string): void {
    if (this.loaded.has(channel)) return;
    this.loaded.add(channel);
    try {
      const data: unknown = JSON.parse(localStorage.getItem(profileKey('chatthing:v1:picker:') + channel) ?? 'null');
      if (!data || typeof data !== 'object') return;
      const record = data as Record<string, unknown>;
      this.coverages.set(channel, new PickerCoverage(record.coverage));
      if (Array.isArray(record.recent))
        this.recents.set(
          channel,
          [
            ...new Set(record.recent.filter((item): item is string => typeof item === 'string' && item.length <= 100)),
          ].slice(0, 24),
        );
      if (Array.isArray(record.uses)) {
        const uses = new Map<string, Usage>();
        for (const entry of record.uses.slice(-1000)) {
          if (
            !Array.isArray(entry) ||
            typeof entry[0] !== 'string' ||
            entry[0].length > 100 ||
            !entry[1] ||
            typeof entry[1] !== 'object'
          )
            continue;
          const u = entry[1] as Record<string, unknown>;
          if (
            typeof u.count === 'number' &&
            Number.isSafeInteger(u.count) &&
            u.count > 0 &&
            typeof u.last === 'number' &&
            Number.isFinite(u.last) &&
            u.last >= 0
          )
            uses.set(entry[0], { count: u.count, last: u.last });
        }
        this.uses.set(channel, uses);
      }
    } catch {
      /* optional storage */
    }
  }
}
const ZOOMS: Record<string, number> = { sm: 0.5, q: 0.75, th: 4 / 3, hf: 1.5, tw: 5 / 3, big: 2 };
export function pickerPreset(saved: PickerOptions, name: string): PickerOptions {
  const preset = PRESETS[name === 'default' ? 'old-default' : name];
  if (!preset) return parseOptions(saved);
  const data = { ...saved, enabled: [...saved.enabled] };
  if (typeof preset.epmix === 'number') data.mixed = preset.epmix > 0;
  if (typeof preset.epnames === 'number') data.names = preset.epnames > 0;
  if (typeof preset.ephold === 'number' && [0, 1, 2].includes(preset.ephold)) {
    data.hold = preset.ephold > 0;
    data.holdPlus = preset.ephold === 2;
  }
  if (typeof preset.epzoom === 'string') data.zoom = ZOOMS[preset.epzoom] ?? data.zoom;
  if (typeof preset.epage === 'number') data.ageRows = preset.epage;
  if (typeof preset.epsort === 'string') {
    data.sort = preset.epsort === 'az' ? 'az' : 'use';
    data.seenOnly = preset.epsort === 'useseen';
  }
  return parseOptions(data);
}
export function pickerPresetGeometry(name: string): string | undefined {
  const box = PRESETS[name === 'default' ? 'old-default' : name]?.epgeo;
  if (!box || typeof box !== 'object') return undefined;
  return (
    box.w +
    'x' +
    box.h +
    (typeof box.left === 'number' && typeof box.top === 'number' ? ',' + box.left + ',' + box.top : '')
  );
}
export function pickerFromURL(saved: PickerOptions, query: URLSearchParams): PickerOptions {
  const data = pickerPreset(saved, query.get('theme') ?? '');
  for (const [param, key] of [
    ['epmix', 'mixed'],
    ['epnames', 'names'],
    ['epmarkers', 'ages'],
  ] as const)
    if (query.has(param)) data[key] = query.get(param) !== '0';
  if (query.has('epzoom')) data.zoom = ZOOMS[query.get('epzoom') ?? ''] ?? 1;
  if (query.has('epsort')) {
    data.sort = query.get('epsort') === 'az' ? 'az' : 'use';
    data.seenOnly = query.get('epsort') === 'useseen';
  }
  if (query.has('ephold')) {
    const mode = query.get('ephold') === '' ? 1 : Number(query.get('ephold'));
    if ([0, 1, 2].includes(mode)) {
      data.hold = mode > 0;
      data.holdPlus = mode === 2;
    }
  }
  if (query.has('eptabs')) {
    const wanted = (query.get('eptabs') ?? '').toLowerCase().split(',');
    const sources = SOURCES.filter((source) => wanted.includes(source.toLowerCase()));
    data.enabled = wanted.includes('none') ? [] : sources.length ? sources : [...SOURCES];
  }
  if (query.has('epage')) {
    const value = query.get('epage') === '' ? 1 : Number(query.get('epage'));
    if ([0, 1, 2].includes(value)) {
      data.ageRows = value;
    }
  }
  if (query.has('epanim')) {
    const wanted = (query.get('epanim') ?? '').split(',');
    const animated = wanted.includes('anim') || wanted.includes('animf'),
      still = wanted.includes('still');
    data.animation = animated && !still ? 'animated' : still && !animated ? 'still' : 'all';
    data.frozen = wanted.includes('animf') && !wanted.includes('anim');
  }
  return parseOptions({
    ...data,
    emojiStyle: query.get('emstyle') ?? data.emojiStyle,
    emojiCategory: query.get('emcat') ?? data.emojiCategory,
    emojiTone: query.get('emtone') ?? data.emojiTone,
  });
}
export function pickerURL(options: PickerOptions, url: URL): void {
  const q = url.searchParams;
  q.set('emstyle', options.emojiStyle);
  q.set('emcat', options.emojiCategory);
  q.set('emtone', options.emojiTone);
  q.set('epmix', options.mixed ? '1' : '0');
  q.set('epnames', options.names ? '1' : '0');
  q.set('epzoom', Object.keys(ZOOMS).find((key) => ZOOMS[key] === options.zoom) ?? '');
  q.set('epsort', options.sort === 'az' ? 'az' : options.seenOnly ? 'useseen' : 'use');
  q.set('ephold', options.hold ? (options.holdPlus ? '2' : '1') : '0');
  q.set('eptabs', options.enabled.length ? options.enabled.map((source) => source.toLowerCase()).join(',') : 'none');
  q.set('epage', String(options.ageRows));
  q.set('epmarkers', options.ages ? '1' : '0');
  q.set(
    'epanim',
    [
      ...(options.animation !== 'still' ? [options.frozen ? 'animf' : 'anim'] : []),
      ...(options.animation !== 'animated' ? ['still'] : []),
    ].join(','),
  );
}
