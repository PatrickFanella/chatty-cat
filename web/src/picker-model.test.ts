// @vitest-environment happy-dom
import { beforeEach, expect, it } from 'vitest';
import { EMOJIS } from './emoji';
import { PickerModel, parseOptions } from './picker-model';
import type { Emote } from './tokens';
import type { ChatMessage } from './protocol';
const make = (code: string, source = 'BTTV', animated = false): Emote => ({ code, source, animated, zeroWidth: false, url: 'https://example.com/' + code, staticUrl: 'https://example.com/still/' + code });
const msg = (text: string, timestamp = 10, id = 'id', channel = 'hasanabi'): ChatMessage => ({ text, timestamp, id, channel, command: 'PRIVMSG', login: 'user', tags: {} });
beforeEach(() => localStorage.clear());
it('validates stored options without trusting arbitrary shapes', () => {
  expect(parseOptions({ enabled: ['BTTV', 'unsafe'], zoom: 100, names: 'yes' })).toMatchObject({ enabled: ['BTTV'], zoom: 1, names: true });
  expect(parseOptions({ enabled: [], animation: 'still', sort: 'az', frozen: true }).enabled).toEqual([]);
});
it('combines providers, original emoji and observed native codes with native precedence', () => {
  const model = new PickerModel(); model.setMetadata('hasanabi', { Kappa: make('Kappa'), KEKW: make('KEKW', 'FFZ animated', true) });
  model.observe({ ...msg('Kappa'), tags: { emotes: '25:0-4' } }, false);
  expect(model.catalog('hasanabi').find((item) => item.code === 'Kappa')?.source).toBe('Twitch');
  expect(model.query('hasanabi', 'KEKW')[0]?.source).toBe('FFZ');
  expect(model.catalog('hasanabi').filter((item) => item.source === 'Emoji')).toHaveLength(EMOJIS.length);
  expect(model.query('hasanabi', 'pizza').some((item) => item.code === '🍕')).toBe(true);
});
it('filters provider, animation and search while preserving case and deduplication', () => {
  const model = new PickerModel(); model.setMetadata('hasanabi', { ABC: make('ABC'), abc: make('abc', '7TV', true) });
  model.options.enabled = ['7TV']; expect(model.query('hasanabi', 'AB').map((item) => item.code)).toEqual(['abc']);
  model.options.animation = 'still'; expect(model.query('hasanabi', '')).toEqual([]);
  model.options.animation = 'animated'; expect(model.query('hasanabi', '')).toHaveLength(1);
});
it('orders by latest channel use, ignores replay and duplicate live IDs, and persists usage', () => {
  const model = new PickerModel(); model.setMetadata('hasanabi', { A: make('A'), B: make('B') }); model.options.enabled = ['BTTV'];
  model.observe(msg('B', 100), false); expect(model.query('hasanabi', '').map((item) => item.code)).toEqual(['A', 'B']);
  model.observe(msg('B', 100), true); model.observe(msg('A', 200, 'later'), true); model.observe(msg('B', 300), true);
  expect(model.query('hasanabi', '').map((item) => item.code)).toEqual(['A', 'B']);
  model.save('hasanabi'); const restored = new PickerModel(); restored.setMetadata('hasanabi', { A: make('A'), B: make('B') });
  expect(restored.query('hasanabi', '').map((item) => item.code)).toEqual(['A', 'B']);
});
it('caps and isolates recent selections and removes unavailable entries', () => {
  const model = new PickerModel(); const emotes = Object.fromEntries(Array.from({ length: 40 }, (_, i) => ['e' + i, make('e' + i)])); model.setMetadata('hasanabi', emotes);
  for (const code of Object.keys(emotes)) model.select('hasanabi', code);
  expect(model.recent('hasanabi')).toHaveLength(24); model.select('hasanabi', 'e20'); expect(model.recent('hasanabi')[0]?.code).toBe('e20');
  expect(model.recent('other')).toEqual([]); model.setMetadata('hasanabi', {}); expect(model.recent('hasanabi')).toEqual([]);
});
it('tolerates invalid stored usage and options', () => {
  localStorage.setItem('chatthing:v1:picker:options', 'broken');
  localStorage.setItem('chatthing:v1:picker:hasanabi', JSON.stringify({ recent: [7, 'Kappa', 'Kappa'], uses: [['Kappa', { count: -1, last: 'bad' }]] }));
  const model = new PickerModel(); model.setMetadata('hasanabi', { Kappa: make('Kappa') }); expect(model.recent('hasanabi').map((item) => item.code)).toEqual(['Kappa']);
});

it('seeds never-used lifetime order without pretending a live observation occurred',()=>{
 const model=new PickerModel();model.setMetadata('hasanabi',{A:make('A'),B:make('B')});model.options.enabled=['BTTV'];model.setSeeds('hasanabi',{B:100,A:10});expect(model.query('hasanabi','').map(item=>item.code)).toEqual(['B','A']);expect(model.lastUse('hasanabi','B')).toBe(0);
 model.observe(msg('A',100,'fresh'),true);expect(model.query('hasanabi','').map(item=>item.code)).toEqual(['A','B']);model.setSeeds('hasanabi',{B:100000});expect(model.query('hasanabi','')[0]?.code).toBe('A');model.options.seenOnly=true;expect(model.query('hasanabi','').map(item=>item.code)).toEqual(['A']);
});
it('round-trips picker provider and animation preferences in original URL aliases',async()=>{
 const {pickerFromURL,pickerURL}=await import('./picker-model');const parsed=pickerFromURL(parseOptions(null),new URLSearchParams('epmix=1&epnames=0&epzoom=th&epsort=useseen&ephold=2&eptabs=7tv,bttv&epanim=animf,still'));
 expect(parsed).toMatchObject({mixed:true,names:false,zoom:4/3,seenOnly:true,hold:true,holdPlus:true,enabled:['7TV','BTTV'],animation:'all',frozen:true});const url=new URL('https://chat.subcult.tv/');pickerURL(parsed,url);expect(pickerFromURL(parseOptions(null),url.searchParams)).toEqual(parsed);
 expect(pickerFromURL(parsed,new URLSearchParams('ephold&epanim=still')).holdPlus).toBe(false);
});
it('shares disabled sources and age rows without widening the restored filter',async()=>{const {pickerFromURL,pickerURL}=await import('./picker-model');const options=parseOptions({enabled:[],ages:false,ageRows:2});const url=new URL('https://chat.subcult.tv/');pickerURL(options,url);expect(pickerFromURL(parseOptions(null),url.searchParams)).toEqual(options);});
