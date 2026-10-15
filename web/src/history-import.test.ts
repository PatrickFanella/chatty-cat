// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { parseHistoryImport } from './history-import';
const row =
  '<div class="row" data-mid="old-id" data-ts="1000" data-ch="one" data-u="alice"><span class="time">00:00</span><a class="name">Alice</a><span class="colon">: </span><span class="msg">hello <img class="emote" alt="Kappa" src="https://example.com/image"> <a href="https://example.com/path">example.com</a></span><span class="rplybtn">↩</span></div>';
it('imports original saved HTML as structured text without mounting executable media', () => {
  const before = document.querySelectorAll('img,iframe,script').length;
  const data = parseHistoryImport(JSON.stringify([row]), 'one');
  expect(data.messages).toEqual([
    {
      id: 'old-id',
      command: 'PRIVMSG',
      channel: 'one',
      login: 'alice',
      timestamp: 1000,
      text: 'hello Kappa https://example.com/path',
      tags: { 'display-name': 'Alice', 'imported-history': '1' },
    },
  ]);
  expect(document.querySelectorAll('img,iframe,script')).toHaveLength(before);
});
it('preserves action and reply context, and accepts original archive wrappers', () => {
  const action = row
    .replace('class="row"', 'class="row action"')
    .replace(
      '<span class="time">',
      '<span class="reply rq" data-pid="parent"><span class="rqt"><b>Bob</b>: <i>Earlier text</i></span></span><span class="time">',
    );
  const data = parseHistoryImport(JSON.stringify([{ mid: 'old-id', ts: 1000, ch: 'one', html: action }]), 'one');
  expect(data.messages[0]?.text).toBe('\x01ACTION hello Kappa https://example.com/path\x01');
  expect(data.messages[0]?.tags).toMatchObject({
    'reply-parent-msg-id': 'parent',
    'reply-parent-display-name': 'Bob',
    'reply-parent-msg-body': 'Earlier text',
  });
});
it('validates structured copies, deduplicates by channel and skips corrupt legacy rows', () => {
  const message = {
    id: 'same',
    command: 'PRIVMSG',
    channel: 'one',
    login: 'alice',
    timestamp: 123,
    text: 'hi',
    tags: { 'local-echo': '1', 'client-notice': '1' },
  };
  const data = parseHistoryImport(
    JSON.stringify({
      format: 'chatty-cat-history',
      version: 1,
      messages: [message, message, { ...message, channel: 'two' }, row.replace('data-ts="1000"', 'data-ts="bad"')],
    }),
    'one',
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
    JSON.stringify(Array(10001).fill(row)),
    ' '.repeat(10 * 1024 * 1024 + 1),
  ])
    expect(() => parseHistoryImport(raw, 'one')).toThrow();
});
it('derives missing legacy channels from original storage keys instead of the current room', () => {
  const withoutChannel = row.replace(' data-ch="one"', '');
  const data = parseHistoryImport(
    JSON.stringify({ 'hasan-history-other': JSON.stringify([withoutChannel]), 'hasan-history': [withoutChannel] }),
    'current',
  );
  expect(data.messages.map((message) => message.channel)).toEqual(['other', 'hasanabi']);
});
