// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { sharedContext, messageContextLabels, messageEffect, watchStreak, publicMessageKey } from './message-context';
import { MessageStore } from './store';
import { messageRow } from './render';
import { parseArchiveQuery } from './archive-query';
import { parseRules, RuleEngine } from './rules';
import type { ChatMessage } from './protocol';
afterEach(() => localStorage.clear());
const message: ChatMessage = {
  id: 'copy-one',
  channel: 'receiving',
  command: 'PRIVMSG',
  login: 'alice',
  text: 'hello',
  timestamp: 100,
  tags: {
    'room-id': '200',
    'source-room-id': '100',
    'source-id': '11111111-1111-4111-8111-111111111111',
    'source-badges': 'subscriber/1',
    'custom-reward-id': 'reward-one',
  },
};
it('preserves explicit origin IDs without guessing unknown channel names or reward titles', () => {
  expect(sharedContext(message)?.roomID).toBe('100');
  expect(messageContextLabels(message).join(' ')).toContain('room 100');
  expect(messageContextLabels(message).join(' ')).toContain('reward-one');
  expect(sharedContext({ ...message, tags: { 'source-room-id': '../bad' } })).toBeUndefined();
  expect(watchStreak(message)).toBeUndefined();
});
it('renders source badges as origin-scoped text when source metadata is unavailable', () => {
  const row = messageRow(message);
  expect(row.querySelector('.source-badges')?.textContent).toContain('Origin badges: [subscriber]');
  expect(row.textContent).toContain('received in #receiving');
  expect(message.channel).toBe('receiving');
  expect(message.tags.badges).toBeUndefined();
});
it('deduplicates shared replay copies per receiving room while retaining distinct destinations', () => {
  const store = new MessageStore(['receiving', 'other']);
  expect(store.add(message)).toBe(true);
  expect(store.add({ ...message, id: 'copy-replayed' })).toBe(false);
  expect(store.add({ ...message, channel: 'other', id: 'other-copy' })).toBe(true);
  expect(publicMessageKey(message)).toBe(publicMessageKey({ ...message, channel: 'other', id: 'other-copy' }));
});
it('exposes only supplied streak/effect metadata with a textual effect fallback', () => {
  const streak = {
    ...message,
    command: 'USERNOTICE',
    tags: {
      'msg-id': 'viewermilestone',
      'msg-param-category': 'watch-streak',
      'msg-param-value': '10',
      'msg-param-copoReward': '450',
    },
  };
  expect(watchStreak(streak)).toEqual({ count: 10, points: 450 });
  expect(watchStreak({ ...streak, tags: { ...streak.tags, 'msg-param-value': '-1' } })).toBeUndefined();
  expect(messageEffect({ ...message, tags: { 'msg-id': 'animated-message' } })).toBe('animated-message');
  expect(messageContextLabels({ ...message, tags: { 'msg-id': 'animated-message' } }).join(' ')).toContain(
    'text fallback',
  );
});
it('extends archive and rule predicates without matching missing context', () => {
  expect(parseArchiveQuery('source:100 sourcebadge:subscriber is:shared reward:reward-one').matches(message)).toBe(
    true,
  );
  expect(parseArchiveQuery('is:streak').matches(message)).toBe(false);
  const rules = parseRules({
    rules: [
      {
        id: 'source',
        name: 'Origin',
        enabled: true,
        field: 'source',
        pattern: '100',
        action: 'highlight',
        color: '#123456',
        scope: 'global',
      },
    ],
  });
  const engine = new RuleEngine(rules);
  expect(engine.observe(message).highlight).toBe(true);
  engine.observe({ ...message, channel: 'other', id: 'copy-two' });
  expect(engine.counts()).toEqual({ source: 1 });
});

it('retains a previously observed copy when later history supplies source tags', () => {
  const store = new MessageStore(['receiving']);
  expect(store.add({ ...message, tags: {} })).toBe(true);
  expect(store.add(message)).toBe(true);
  expect(store.messages).toHaveLength(1);
});
it('uses known origin metadata only for labeled source badges', () => {
  const origin = {
    channel: 'origin',
    broadcasterID: '100',
    emotes: {},
    badges: {
      subscriber: { '1': { url: 'https://cdn.test/badge', title: 'Origin Subscriber', description: 'Source channel' } },
    },
    stream: { title: '', uptime: '', viewers: '' },
    errors: [],
  };
  const row = messageRow(message, undefined, false, undefined, origin);
  expect(row.querySelector('.source-badge')?.getAttribute('alt')).toBe('[Origin Origin Subscriber]');
  expect(row.textContent).toContain('Shared origin #origin');
});
