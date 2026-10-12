// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { StatsPanel, rateGraph, summarize } from './stats';
import type { ChatMessage } from './protocol';
const message: ChatMessage = { id: '1', command: 'PRIVMSG', channel: 'one', login: 'alice', text: 'Kappa Kappa https://example.com/a', timestamp: 60000, tags: { badges: 'subscriber/1' } };
const emotes = () => ({ Kappa: { code: 'Kappa', url: 'https://example.com/a', source: 'BTTV', staticUrl: '', animated: false, zeroWidth: false } });
it('counts distinct messages, repeated emotes, badges, links and time bins', () => {
  const data = summarize([message, message, { ...message, id: '2', login: 'bob' }], 120000, 120000, '', new Set(), emotes);
  expect(data.messages).toBe(2); expect(data.chatters).toBe(2); expect(data.perMinute).toBe(1); expect(data.peakPerMinute).toBe(2);
  expect(data.emotes).toEqual([{ name: 'Kappa', count: 4 }]); expect(data.links).toEqual([{ name: 'example.com', count: 2 }]);
  expect(data.badges).toEqual([{ name: 'subscriber', count: 2 }]); expect(data.buckets.reduce((a, b) => a + b)).toBe(2);
});
it('isolates channel/time/exclusions and ignores system or future messages', () => {
  const data = summarize([message, { ...message, command: 'NOTICE', id: '2' }, { ...message, channel: 'two', id: '3' }, { ...message, timestamp: 200000, id: '4' }], 120000, 60000, 'one', new Set(), emotes);
  expect(data.messages).toBe(1); expect(summarize([message], 120000, 60000, '', new Set(['alice']), emotes).messages).toBe(0);
});
it('uses accessible SVG labels and handles an empty graph', () => {
  const graph = rateGraph([0, 1, 3], 'Three messages'); expect(graph.getAttribute('aria-label')).toBe('Three messages');
  expect(graph.querySelectorAll('rect')).toHaveLength(3); expect(graph.querySelector('rect')?.getAttribute('height')).toBe('0');
  expect(rateGraph([], 'No messages').querySelectorAll('rect')).toHaveLength(0);
});
it('discloses partial connection windows without discarding recovered counts', () => {
  const gap: ChatMessage = { ...message, id: 'gap-start', command: 'NOTICE', login: '', timestamp: 90000, tags: { 'client-notice': '1', 'gap-state': 'start', 'gap-start': '90000' } };
  const data = summarize([message, gap], 120000, 60000, 'one', new Set(), emotes);
  expect(data.messages).toBe(1); expect(data.gaps.filter(Boolean)).toHaveLength(30);
  const graph = rateGraph(data.buckets, 'Activity', data.gaps);
  expect(graph.getAttribute('aria-label')).toContain('counts may be incomplete');
  expect(graph.querySelectorAll('.graph-gap')).toHaveLength(30);
  expect(graph.querySelector('.graph-gap title')?.textContent).toContain('Connection interrupted');
});

it('counts glorp messages once and keeps rankings scoped and excluded',()=>{
 const rows=[{...message,text:'glorp F',id:'g1'},{...message,text:'F',id:'g2',login:'bob'},{...message,text:'coffee',id:'g3'}];
 const data=summarize([...rows,rows[0]!],120000,120000,'one',new Set(['bob']),emotes);
 expect(data.glorps).toBe(1);expect(data.glorpers).toEqual([{name:'alice',count:1}]);
});
it('counts bare-domain posts using the same parser as chat',()=>{
 const data=summarize([{...message,text:'example.com/a alice@example.org'}],120000,120000,'one',new Set(),emotes);
 expect(data.links).toEqual([{name:'example.com',count:1}]);
});

it('persists independent ranking windows and channel scope, and uses provider seeds on request',async()=>{
 const {StatsLedger}=await import('./stats-ledger');
 localStorage.clear();
 const setup=()=>{
  document.body.innerHTML='<button id="trigger"></button><div id="header"></div><dialog><button id="stats-close"></button><select id="stats-scope"><option value="60000">Minute</option></select><select id="stats-channel"><option value="">All</option></select><input id="stats-exclusions"><select id="stats-badge-order"><option value="versions">Versions</option><option value="name">Name</option></select><select data-stat-kind="users"><option value="24">Day</option><option value="0">All</option></select><select data-stat-kind="emotes"><option value="3">3 hours</option><option value="se">StreamElements</option></select><div id="stats-summary"></div><div id="stats-graph"></div><div id="stats-lists"></div></dialog>';
  const dialog=document.querySelector('dialog')!;
  const ledger=new StatsLedger(['one','two'],emotes);ledger.observe(message);
  const panel=new StatsPanel(dialog,document.querySelector('button')!,document.querySelector('#header') as HTMLElement,()=>[],emotes,['one','two'],undefined,ledger,channel=>({Kappa:channel==='one'?8:12}));
  return {dialog,panel};
 };
 const first=setup();
 (document.querySelector('#stats-channel') as HTMLSelectElement).value='one';
 (document.querySelector('[data-stat-kind="users"]') as HTMLSelectElement).value='0';
 (document.querySelector('[data-stat-kind="emotes"]') as HTMLSelectElement).value='se';
 first.dialog.dispatchEvent(new Event('change'));first.panel.showRail(true);
 expect(document.querySelector('#stats-lists')?.textContent).toContain('Kappa · 8');first.panel.stop();
 const next=setup();
 expect((document.querySelector('#stats-channel') as HTMLSelectElement).value).toBe('one');
 expect((document.querySelector('[data-stat-kind="users"]') as HTMLSelectElement).value).toBe('0');
 expect((document.querySelector('[data-stat-kind="emotes"]') as HTMLSelectElement).value).toBe('se');next.panel.stop();localStorage.clear();
});
