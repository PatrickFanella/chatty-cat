import { expect, it } from 'vitest';
import { gapBuckets, readChatGaps } from './chat-gaps';
import type { ChatMessage } from './protocol';
const notice = (phase: 'start' | 'end', at: number, start: number): ChatMessage => ({
  id: 'gap-' + phase,
  command: 'NOTICE',
  channel: 'one',
  login: '',
  text: '',
  timestamp: at,
  tags: { 'client-notice': '1', 'gap-state': phase, 'gap-start': String(start) },
});
it('marks only intersecting bins, including an open interruption', () => {
  const bins = gapBuckets([notice('start', 10000, 10000), notice('end', 20000, 10000)], 60000, 60000);
  expect(bins.filter(Boolean)).toHaveLength(10);
  expect(bins[9]).toBe(false);
  expect(bins[10]).toBe(true);
  expect(bins[19]).toBe(true);
  expect(bins[20]).toBe(false);
  expect(gapBuckets([notice('start', 50000, 50000)], 60000, 60000).filter(Boolean)).toHaveLength(10);
});
it('retains independent end evidence after start eviction and ignores malformed or remote notices', () => {
  const end = notice('end', 20000, 10000);
  expect(readChatGaps([end, end], 60000)).toEqual([{ channel: 'one', start: 10000, end: 20000, kind: 'connection' }]);
  for (const invalid of [
    { ...end, login: 'twitch' },
    { ...end, id: 'ordinary' },
    { ...end, timestamp: 70000 },
    { ...end, tags: { ...end.tags, 'gap-start': 'Infinity' } },
    { ...end, tags: { ...end.tags, 'gap-start': '30000' } },
  ])
    expect(readChatGaps([invalid], 60000)).toEqual([]);
  expect(gapBuckets([end], 120000, 60000).some(Boolean)).toBe(false);
  expect(gapBuckets([notice('end', 15000, 15000)], 60000, 60000).some(Boolean)).toBe(false);
});
