// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { StreamHistory } from './stream-history';
import type { ChannelMetadata } from './metadata';
const data: ChannelMetadata = { channel: 'one', emotes: {}, badges: {}, errors: [], stream: { uptime: '1 hour, 2 minutes', viewers: '42', title: 'A stream' } };
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
it('retains viewer/title samples and known state changes independently of scrollback', () => {
  vi.spyOn(Date, 'now').mockReturnValue(10120000);
  const history = new StreamHistory(['one']); history.observe(data, 10000000);
  history.observe({ ...data, stream: { ...data.stream, viewers: '60', title: 'New title' } }, 10060000);
  history.observe({ ...data, stream: { uptime: 'offline', viewers: '0', title: '' } }, 10120000);
  expect(history.samples('one', 10000000)).toHaveLength(3); expect(history.samples('one', 10000000)[2]?.live).toBe(false);
  expect(history.peak('one', 10000000)).toEqual({ viewers: 60, at: 10060000 });
  history.save(); expect(new StreamHistory(['one']).samples('one', 10000000)).toHaveLength(3);
});
it('does not invent offline transitions from failed metadata and isolates channel samples', () => {
  const history = new StreamHistory(['one', 'two']); history.observe(data, 1000);
  history.observe({ ...data, errors: ['stream uptime'], stream: { uptime: '', viewers: '', title: '' } }, 2000);
  history.observe({ ...data, channel: 'two', stream: { ...data.stream, viewers: '99' } }, 3000);
  expect(history.samples('one', 0)).toHaveLength(1); expect(history.peak('one', 0)?.viewers).toBe(42); expect(history.peak('two', 0)?.viewers).toBe(99);
});
it('retains exact VOD timing and safe links, deduplicating archive metadata', () => {
  const history = new StreamHistory(['one']); const lastVod = { start: '2026-10-10T12:00:00Z', end: '2026-10-10T14:00:00Z', url: 'https://www.twitch.tv/videos/123', title: 'Archive' };
  history.observe({ ...data, lastVod }, Date.parse('2026-10-11T00:00:00Z')); history.observe({ ...data, lastVod }, Date.parse('2026-10-11T00:01:00Z'));
  expect(history.archives('one')).toEqual([lastVod]);
  localStorage.setItem('chatthing:v1:stream-history', JSON.stringify({ version: 1, samples: [['one', [{ at: 1, live: true, viewers: -1, title: 'bad' }]]], archives: [] }));
  expect(new StreamHistory(['one']).samples('one', 0)).toEqual([]);
});
it('treats failed title/viewer reads as missing instead of copying fallback values into comparison observations',()=>{const history=new StreamHistory(['one']);history.observe({...data,errors:['stream title','stream viewers']},1000);expect(history.samples('one',0)[0]).toMatchObject({title:'',viewers:null});});
