// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { parseArchiveQuery, formatArchiveClause } from './archive-query';
import type { ChatMessage } from './protocol';
const message: ChatMessage = {
  id: 'one',
  command: 'PRIVMSG',
  channel: 'one',
  login: 'Alice',
  text: 'hello Kappa https://video.example.org/watch',
  timestamp: Date.parse('2026-10-12T12:00:00Z'),
  tags: { badges: 'subscriber/12,moderator/1', emotes: '25:6-10', 'reply-parent-msg-id': 'parent' },
};
it('combines clauses, alternative values and negation across retained message fields', () => {
  expect(
    parseArchiveQuery(
      'sender:alice,bob channel:one badge:subscriber emote:25 domain:example.org is:reply -text:absent',
    ).matches(message),
  ).toBe(true);
  expect(parseArchiveQuery('sender:bob -badge:moderator').matches(message)).toBe(false);
  expect(parseArchiveQuery('emote:Kappa after:2026-10-12 before:2026-10-13').matches(message)).toBe(true);
  expect(parseArchiveQuery('is:moderation').matches({ ...message, command: 'CLEARMSG' })).toBe(true);
  expect(parseArchiveQuery('is:deleted').matches({ ...message, tags: { deleted: 'true' } })).toBe(true);
});
it('keeps quoted phrases and URLs literal, and round trips builder values containing commas/quotes', () => {
  expect(parseArchiveQuery('"hello Kappa"').matches(message)).toBe(true);
  expect(parseArchiveQuery('https://video.example.org/watch').matches(message)).toBe(true);
  const source = formatArchiveClause('text', ['hello, "world"'], true);
  expect(parseArchiveQuery(source).matches({ ...message, text: 'hello, "world"' })).toBe(false);
  expect(parseArchiveQuery('regex:"^hello.*watch$"').matches(message)).toBe(true);
});
it('rejects malformed, unbounded or unsupported queries with actionable errors', () => {
  for (const source of [
    'unknown:value',
    'sender:',
    'sender:bad-name',
    'is:unknown',
    '"unclosed',
    'before:yesterday',
    'after:2026-10-12T12:00:00',
    'regex:"(a+)+$"',
    'text:' + 'x'.repeat(501),
    Array(33).fill('hello').join(' '),
  ])
    expect(() => parseArchiveQuery(source)).toThrow();
});
