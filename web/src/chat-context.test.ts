// @vitest-environment happy-dom
import { parseArchiveQuery } from './archive-query';
import { afterEach, expect, it } from 'vitest';
import { parseChatContext, applyChatContext } from './chat-context';
import { MessageStore } from './store';
import { messageEffect, watchStreak, messageContextLabels } from './message-context';
import type { ChatMessage } from './protocol';
const id = '11111111-1111-4111-8111-111111111111';
const row = {
  id,
  eventID: 'event-one',
  userID: '99',
  command: 'PRIVMSG',
  at: Date.now(),
  tags: {
    'source-room-id': '456',
    'source-id': '22222222-2222-4222-8222-222222222222',
    'source-login': 'origin',
    'source-badges': 'subscriber/3',
    'eventsub-message-type': 'power_ups_message_effect',
    'custom-reward-id': 'reward-one',
  },
};
const snapshot = () => ({
  format: 'chatty-cat-public-context',
  account: '42',
  channel: 'one',
  broadcasterID: '123',
  epoch: 'a'.repeat(32),
  state: 'live',
  active: true,
  detail: 'Live',
  rows: [row],
});
const message: ChatMessage = {
  id,
  channel: 'one',
  command: 'PRIVMSG',
  login: 'alice',
  text: 'actual public text',
  timestamp: row.at,
  tags: { 'room-id': '123', 'user-id': '99' },
};
afterEach(() => localStorage.clear());
it('projects supplemental tags only onto a matching already public message', () => {
  const s = parseChatContext(snapshot(), '42', 'one'),
    enriched = applyChatContext(message, s.rows[0]!, s.broadcasterID, 'one');
  expect(enriched.text).toBe(message.text);
  expect(enriched.tags['source-room-id']).toBe('456');
  expect(messageEffect(enriched)).toBe('animated-message');
  expect(parseArchiveQuery('is:effect source:456 reward:reward-one').matches(enriched)).toBe(true);
  expect(messageContextLabels(enriched).join(' ')).toContain('#origin');
  expect(applyChatContext(enriched, s.rows[0]!, s.broadcasterID, 'one')).toBe(enriched);
  for (const changed of [
    { ...message, id: 'other' },
    { ...message, channel: 'other' },
    { ...message, command: 'WHISPER' },
    { ...message, tags: { ...message.tags, 'user-id': '100' } },
    { ...message, tags: { ...message.tags, 'room-id': 'other' } },
    { ...message, tags: { ...message.tags, 'local-echo': '1' } },
    { ...message, tags: { ...message.tags, 'source-room-id': '999' } },
  ])
    expect(applyChatContext(changed, s.rows[0]!, s.broadcasterID, 'one')).toBe(changed);
});
it('rejects body/private fields, account mismatches and malformed context tags', () => {
  for (const value of [
    { ...snapshot(), account: '43' },
    { ...snapshot(), rows: [{ ...row, text: 'private-held-canary' }] },
    { ...snapshot(), rows: [{ ...row, tags: { ...row.tags, 'system-msg': 'private' } }] },
    { ...snapshot(), rows: [{ ...row, tags: { 'source-login': 'forged' } }] },
    { ...snapshot(), rows: [{ ...row, tags: { 'source-room-id': 'javascript:bad' } }] },
    { ...snapshot(), rows: [row, row] },
  ])
    expect(() => parseChatContext(value, '42', 'one')).toThrow();
});
it('enriches retained public rows without creating a message from metadata or replaying counts', () => {
  const store = new MessageStore(['one']);
  const s = parseChatContext(snapshot(), '42', 'one');
  expect(store.enrichPublic((m) => applyChatContext(m, s.rows[0]!, s.broadcasterID, 'one'))).toEqual([]);
  expect(store.messages).toHaveLength(0);
  store.add(message);
  expect(store.enrichPublic((m) => applyChatContext(m, s.rows[0]!, s.broadcasterID, 'one'))).toHaveLength(1);
  expect(store.messages).toHaveLength(1);
  expect(store.add({ ...message, id: 'copy-replay', tags: { ...store.messages[0]!.tags } })).toBe(false);
  expect(() => store.enrichPublic((m) => ({ ...m, text: 'private-canary' }))).toThrow();
  expect(store.messages[0]!.text).toBe('actual public text');
});
it('renders supplied zero-point watch streaks without inventing an IRC notice kind', () => {
  const s = parseChatContext(
    {
      ...snapshot(),
      rows: [{ ...row, command: 'USERNOTICE', tags: { 'eventsub-streak-count': '10', 'eventsub-streak-points': '0' } }],
    },
    '42',
    'one',
  );
  const notice = applyChatContext({ ...message, command: 'USERNOTICE' }, s.rows[0]!, s.broadcasterID, 'one');
  expect(watchStreak(notice)).toEqual({ count: 10, points: 0 });
  expect(notice.tags['msg-id']).toBeUndefined();
});
