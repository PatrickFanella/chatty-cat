import { expect, it } from 'vitest';
import { headerRate } from './header-rate';
import type { ChatMessage } from './protocol';
const message: ChatMessage = { id: '1', command: 'PRIVMSG', channel: 'one', login: 'alice', text: 'hi', timestamp: 299000, tags: {} };
it('keeps a four-minute series of five-second rates and an hour of chatters', () => {
  const data = headerRate([message, { ...message, id: 'old', login: 'bob', timestamp: 10000 }], 300000, new Set());
  expect(data.rates).toHaveLength(240); expect(data.rates[239]).toBe(.2); expect(data.perSecond).toBe(.2); expect(data.chatters).toBe(2);
  const spike = headerRate([{ ...message, timestamp: 100000 }], 300000, new Set());
  expect(spike.rates.filter(rate => rate > 0)).toHaveLength(5); expect(spike.perSecond).toBe(0);
});
it('does not stretch a short series, duplicate replay, count notices or mix excluded users', () => {
  const data = headerRate([message, message, { ...message, id: 'notice', command: 'NOTICE' }, { ...message, id: 'bob', login: 'bob' }, { ...message, id: 'future', timestamp: 301000 }], 300000, new Set(['bob']));
  expect(data.rates.slice(0, 239).every(rate => rate === 0)).toBe(true); expect(data.rates[239]).toBe(.2); expect(data.chatters).toBe(1);
});
it('uses exact current-rate boundaries and completes graph seconds before now', () => {
  const data = headerRate([{ ...message, id: 'boundary', timestamp: 295500 }, { ...message, id: 'current', timestamp: 300100 }], 300500, new Set());
  expect(data.perSecond).toBe(.2); expect(data.end).toBe(300000); expect(data.rates[239]).toBe(.2);
});
it('marks outage bins without treating them as quiet or dropping backfill', () => {
  const gap: ChatMessage = { ...message, id: 'gap-start', login: '', command: 'NOTICE', timestamp: 298000, tags: { 'client-notice': '1', 'gap-state': 'start', 'gap-start': '298000' } };
  const data = headerRate([message, gap], 300000, new Set());
  expect(data.gaps.filter(Boolean)).toHaveLength(2); expect(data.rates[239]).toBe(.2);
});
