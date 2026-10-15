// @vitest-environment happy-dom
import { beforeEach, expect, it } from 'vitest';
import { EMOJIS } from './emoji';
import { PickerModel, parseOptions } from './picker-model';
import type { Emote } from './tokens';
import type { ChatMessage } from './protocol';
const make = (code: string, source = 'BTTV', animated = false): Emote => ({
  code,
  source,
  animated,
  zeroWidth: false,
  url: 'https://example.com/' + code,
  staticUrl: 'https://example.com/still/' + code,
});
const msg = (text: string, timestamp = 10, id = 'id', channel = 'hasanabi'): ChatMessage => ({
  text,
  timestamp,
  id,
  channel,
  command: 'PRIVMSG',
  login: 'user',
  tags: {},
});
beforeEach(() => localStorage.clear());
it('saves per-channel coverage and restores page-closed time without overwriting usage', () => {
  const model = new PickerModel();
  model.connection(['hasanabi'], 'connected');
  model.setMetadata('hasanabi', { A: make('A') });
  model.observe(msg('A', Date.now()), true);
  model.saveAll();
  const saved = JSON.parse(localStorage.getItem('chatthing:v1:picker:hasanabi') ?? '{}');
  saved.coverage.savedAt = Date.now() - 120000;
  localStorage.setItem('chatthing:v1:picker:hasanabi', JSON.stringify(saved));
  const restored = new PickerModel();
  restored.connection(['hasanabi', 'other'], 'connected');
  expect(restored.coverage('hasanabi').missed(180)).toBe(true);
  expect(restored.coverage('other').missed(180)).toBe(false);
  expect(restored.lastUse('hasanabi', 'A')).toBeGreaterThan(0);
});
it('validates stored options without trusting arbitrary shapes', () => {
  expect(parseOptions({ enabled: ['BTTV', 'unsafe'], zoom: 100, names: 'yes' })).toMatchObject({
    enabled: ['BTTV'],
    zoom: 1,
    names: true,
  });
  expect(parseOptions({ enabled: [], animation: 'still', sort: 'az', frozen: true }).enabled).toEqual([]);
});
it('combines providers, original emoji and observed native codes with native precedence', () => {
  const model = new PickerModel();
  model.setMetadata('hasanabi', { Kappa: make('Kappa'), KEKW: make('KEKW', 'FFZ animated', true) });
  model.observe({ ...msg('Kappa'), tags: { emotes: '25:0-4' } }, false);
  expect(model.catalog('hasanabi').find((item) => item.code === 'Kappa')?.source).toBe('Twitch');
  expect(model.query('hasanabi', 'KEKW')[0]?.source).toBe('FFZ');
  expect(model.catalog('hasanabi').filter((item) => item.source === 'Emoji')).toHaveLength(EMOJIS.length);
  expect(model.query('hasanabi', 'pizza').some((item) => item.code === '🍕')).toBe(true);
});
it('filters provider, animation and search while preserving case and deduplication', () => {
  const model = new PickerModel();
  model.setMetadata('hasanabi', { ABC: make('ABC'), abc: make('abc', '7TV', true) });
  model.options.enabled = ['7TV'];
  expect(model.query('hasanabi', 'AB').map((item) => item.code)).toEqual(['abc']);
  model.options.animation = 'still';
  expect(model.query('hasanabi', '')).toEqual([]);
  model.options.animation = 'animated';
  expect(model.query('hasanabi', '')).toHaveLength(1);
});
it('orders by latest channel use, ignores replay and duplicate live IDs, and persists usage', () => {
  const model = new PickerModel();
  model.setMetadata('hasanabi', { A: make('A'), B: make('B') });
  model.options.enabled = ['BTTV'];
  model.observe(msg('B', 100), false);
  expect(model.query('hasanabi', '').map((item) => item.code)).toEqual(['A', 'B']);
  model.observe(msg('B', 100), true);
  model.observe(msg('A', 200, 'later'), true);
  model.observe(msg('B', 300), true);
  expect(model.query('hasanabi', '').map((item) => item.code)).toEqual(['A', 'B']);
  model.save('hasanabi');
  const restored = new PickerModel();
  restored.setMetadata('hasanabi', { A: make('A'), B: make('B') });
  expect(restored.query('hasanabi', '').map((item) => item.code)).toEqual(['A', 'B']);
});
it('caps and isolates recent selections and removes unavailable entries', () => {
  const model = new PickerModel();
  const emotes = Object.fromEntries(Array.from({ length: 40 }, (_, i) => ['e' + i, make('e' + i)]));
  model.setMetadata('hasanabi', emotes);
  for (const code of Object.keys(emotes)) model.select('hasanabi', code);
  expect(model.recent('hasanabi')).toHaveLength(24);
  model.select('hasanabi', 'e20');
  expect(model.recent('hasanabi')[0]?.code).toBe('e20');
  expect(model.recent('other')).toEqual([]);
  model.setMetadata('hasanabi', {});
  expect(model.recent('hasanabi')).toEqual([]);
});
it('tolerates invalid stored usage and options', () => {
  localStorage.setItem('chatthing:v1:picker:options', 'broken');
  localStorage.setItem(
    'chatthing:v1:picker:hasanabi',
    JSON.stringify({ recent: [7, 'Kappa', 'Kappa'], uses: [['Kappa', { count: -1, last: 'bad' }]] }),
  );
  const model = new PickerModel();
  model.setMetadata('hasanabi', { Kappa: make('Kappa') });
  expect(model.recent('hasanabi').map((item) => item.code)).toEqual(['Kappa']);
});

it('seeds never-used lifetime order without pretending a live observation occurred', () => {
  const model = new PickerModel();
  model.setMetadata('hasanabi', { A: make('A'), B: make('B') });
  model.options.enabled = ['BTTV'];
  model.setSeeds('hasanabi', { B: 100, A: 10 });
  expect(model.query('hasanabi', '').map((item) => item.code)).toEqual(['B', 'A']);
  expect(model.lastUse('hasanabi', 'B')).toBe(0);
  model.observe(msg('A', 100, 'fresh'), true);
  expect(model.query('hasanabi', '').map((item) => item.code)).toEqual(['A', 'B']);
  model.setSeeds('hasanabi', { B: 100000 });
  expect(model.query('hasanabi', '')[0]?.code).toBe('A');
  model.options.seenOnly = true;
  expect(model.query('hasanabi', '').map((item) => item.code)).toEqual(['A']);
});
it('round-trips picker provider and animation preferences in original URL aliases', async () => {
  const { pickerFromURL, pickerURL } = await import('./picker-model');
  const parsed = pickerFromURL(
    parseOptions(null),
    new URLSearchParams('epmix=1&epnames=0&epzoom=th&epsort=useseen&ephold=2&eptabs=7tv,bttv&epanim=animf,still'),
  );
  expect(parsed).toMatchObject({
    mixed: true,
    names: false,
    zoom: 4 / 3,
    seenOnly: true,
    hold: true,
    holdPlus: true,
    enabled: ['7TV', 'BTTV'],
    animation: 'all',
    frozen: true,
  });
  const url = new URL('https://chat.subcult.tv/');
  pickerURL(parsed, url);
  expect(pickerFromURL(parseOptions(null), url.searchParams)).toEqual(parsed);
  expect(pickerFromURL(parsed, new URLSearchParams('ephold&epanim=still')).holdPlus).toBe(false);
});
it('shares disabled sources and age rows without widening the restored filter', async () => {
  const { pickerFromURL, pickerURL } = await import('./picker-model');
  const options = parseOptions({ enabled: [], ages: false, ageRows: 2 });
  const url = new URL('https://chat.subcult.tv/');
  pickerURL(options, url);
  expect(pickerFromURL(parseOptions(null), url.searchParams)).toEqual(options);
});
it('resetting order preserves catalog, seeds and recents while clearing persisted live usage', () => {
  const model = new PickerModel();
  model.setMetadata('hasanabi', { A: make('A'), B: make('B') });
  model.options.enabled = ['BTTV'];
  model.setSeeds('hasanabi', { B: 100 });
  model.select('hasanabi', 'A');
  model.observe(msg('A', 100, 'live'), true);
  expect(model.query('hasanabi', '')[0]?.code).toBe('A');
  model.resetOrder('hasanabi');
  expect(model.query('hasanabi', '')[0]?.code).toBe('B');
  expect(model.lastUse('hasanabi', 'A')).toBe(0);
  expect(model.recent('hasanabi')[0]?.code).toBe('A');
  const restored = new PickerModel();
  restored.setMetadata('hasanabi', { A: make('A') });
  expect(restored.lastUse('hasanabi', 'A')).toBe(0);
});
it('applies preset picker defaults before explicit URL overrides', async () => {
  const { pickerPreset, pickerPresetGeometry, pickerFromURL, defaultOptions } = await import('./picker-model');
  const original = defaultOptions();
  original.zoom = 2;
  original.mixed = false;
  original.hold = false;
  const preset = pickerPreset(original, 'default');
  expect(preset.mixed).toBe(true);
  expect(preset.hold).toBe(true);
  expect(preset.holdPlus).toBe(true);
  expect(pickerPresetGeometry('default')).toBe('876x625,646,173');
  expect(pickerPreset(original, 'nightshade').zoom).toBe(0.75);
  expect(pickerPresetGeometry('nightshade')).toBeUndefined();
  const explicit = pickerFromURL(original, new URLSearchParams('theme=default&epmix=0&ephold=0&epzoom=big'));
  expect(explicit.mixed).toBe(false);
  expect(explicit.hold).toBe(false);
  expect(explicit.zoom).toBe(2);
  expect(original.mixed).toBe(false);
});
