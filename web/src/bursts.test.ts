import { expect, it } from 'vitest';
import { loudestBursts } from './bursts';
import { summarize } from './stats';
import type { ChatMessage } from './protocol';

function spike(second: number, count: number): ChatMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${second}-${i}`,
    command: 'PRIVMSG',
    channel: 'one',
    login: 'alice',
    text: 'hi',
    timestamp: second * 1000 + i,
    tags: {},
  }));
}
it('requires four messages per second over five seconds and collapses nearby samples', () => {
  expect(loudestBursts(spike(10, 19), [], 60000)).toEqual([]);
  expect(loudestBursts(spike(10, 20), [], 60000)).toEqual([{ perSecond: 4, timestamp: 11000 }]);
  const messages = [...spike(10, 10), ...spike(14, 15)];
  expect(loudestBursts(messages, [], 60000)).toEqual([{ perSecond: 5, timestamp: 15000 }]);
});
it('ranks distinct bursts and retains the earliest sustained peak time', () => {
  const messages = [...spike(10, 25), ...spike(25, 25), ...spike(50, 30), ...spike(90, 35), ...spike(130, 40)];
  expect(loudestBursts(messages, [], 180000)).toEqual([
    { perSecond: 8, timestamp: 131000 },
    { perSecond: 7, timestamp: 91000 },
    { perSecond: 6, timestamp: 51000 },
  ]);
  expect(loudestBursts([...spike(10, 25), ...spike(25, 25)], [], 60000)).toEqual([{ perSecond: 5, timestamp: 11000 }]);
});
it('does not rank incomplete connection windows or unfinished seconds', () => {
  const messages = spike(10, 30);
  const gap: ChatMessage = {
    id: 'gap-start',
    command: 'NOTICE',
    channel: 'two',
    login: '',
    text: '',
    timestamp: 9000,
    tags: { 'client-notice': '1', 'gap-state': 'start', 'gap-start': '9000' },
  };
  expect(loudestBursts(messages, [gap], 60000)).toEqual([]);
  expect(loudestBursts(messages, [], 10500)).toEqual([]);
  const end = { ...gap, id: 'gap-end', timestamp: 10000, tags: { ...gap.tags, 'gap-state': 'end' } };
  // The first complete five-second window after recovery still contains the spike.
  expect(loudestBursts(messages, [gap, end], 60000)).toEqual([{ perSecond: 6, timestamp: 15000 }]);
});
it('uses the ranking scope, exclusions and deduplication', () => {
  const messages = [
    ...spike(10, 25),
    ...spike(10, 25),
    ...spike(30, 40).map((m) => ({ ...m, channel: 'two', login: 'bob' })),
  ];
  expect(summarize(messages, 60000, 60000, 'one', new Set(), () => ({})).bursts).toEqual([
    { perSecond: 5, timestamp: 11000 },
  ]);
  expect(summarize(messages, 60000, 60000, '', new Set(['bob']), () => ({})).bursts).toEqual([
    { perSecond: 5, timestamp: 11000 },
  ]);
  expect(summarize(messages, 60000, 20000, '', new Set(), () => ({})).bursts).toEqual([]);
});
