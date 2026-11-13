// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { parseHistoryImport } from './history-import';
const message = {
  id: 'same',
  command: 'PRIVMSG',
  channel: 'one',
  login: 'alice',
  timestamp: 123,
  text: 'hi',
  tags: { 'local-echo': '1', 'client-notice': '1' },
};
it('validates structured copies, deduplicates by channel and skips invalid rows', () => {
  const data = parseHistoryImport(
    JSON.stringify({
      format: 'chatty-cat-history',
      version: 1,
      messages: [message, message, { ...message, channel: 'two' }, { ...message, id: 'bad', timestamp: 'bad' }],
    }),
  );
  expect(data.messages).toHaveLength(2);
  expect(data.skipped).toBe(2);
  expect(data.messages[0]?.tags['local-echo']).toBeUndefined();
  expect(data.messages[0]?.tags['client-notice']).toBeUndefined();
});
it('rejects unsupported exports and oversized input instead of partially importing them', () => {
  for (const raw of [
    'broken',
    '{}',
    '{"format":"unknown","messages":[]}',
    JSON.stringify([message]),
    JSON.stringify({ 'hasan-history': JSON.stringify([message]) }),
    JSON.stringify({ format: 'chatty-cat-history', version: 1, messages: Array(10001).fill(message) }),
    ' '.repeat(10 * 1024 * 1024 + 1),
  ])
    expect(() => parseHistoryImport(raw)).toThrow();
});
