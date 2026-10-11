// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { rateGraph, summarize } from './stats';
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
it('counts glorp messages once and keeps rankings scoped and excluded',()=>{
 const rows=[{...message,text:'glorp F',id:'g1'},{...message,text:'F',id:'g2',login:'bob'},{...message,text:'coffee',id:'g3'}];
 const data=summarize([...rows,rows[0]!],120000,120000,'one',new Set(['bob']),emotes);
 expect(data.glorps).toBe(1);expect(data.glorpers).toEqual([{name:'alice',count:1}]);
});
it('counts bare-domain posts using the same parser as chat',()=>{
 const data=summarize([{...message,text:'example.com/a alice@example.org'}],120000,120000,'one',new Set(),emotes);
 expect(data.links).toEqual([{name:'example.com',count:1}]);
});
