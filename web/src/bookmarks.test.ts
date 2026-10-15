// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import {
  BookmarkStore,
  bookmarkMessage,
  bookmarkContext,
  parseBookmarks,
  shareBookmark,
  recoveredBookmarkMessages,
} from './bookmarks';
import type { ChatMessage } from './protocol';
const message: ChatMessage = {
  id: 'anchor',
  command: 'PRIVMSG',
  channel: 'one',
  login: 'alice',
  text: 'hello @bob https://example.org/private',
  timestamp: 100,
  tags: { 'reply-parent-msg-id': 'root', 'reply-thread-parent-msg-id': 'root', token: 'never store this' },
};
afterEach(() => localStorage.clear());
it('stores bounded public excerpts separately from private notes and isolates profiles', () => {
  const store = new BookmarkStore();
  store.setAccount('42');
  const entry = store.save(bookmarkMessage(message), [], 'message', 'private note', ['Important']);
  expect(entry.tags).toEqual(['important']);
  expect(JSON.stringify(entry)).not.toContain('token');
  expect(store.list()).toHaveLength(1);
  expect(() => bookmarkMessage({ ...message, command: 'WHISPER' })).toThrow();
  store.setAccount('43');
  expect(store.list()).toEqual([]);
  store.setAccount('42');
  expect(store.list()[0]?.note).toBe('private note');
  store.remove(entry.id);
  expect(store.list()).toEqual([]);
});
it('keeps conversation context bounded, in channel and free of whispers', () => {
  const records = Array.from({ length: 20 }, (_, i) => ({
    ...message,
    id: String(i),
    timestamp: i,
    tags: { 'reply-parent-msg-id': 'root' },
  }));
  const root = { ...message, id: 'root', timestamp: 1, tags: {} };
  const result = bookmarkContext(
    bookmarkMessage(message),
    [
      ...records,
      root,
      { ...message, channel: 'other', id: 'other' },
      { ...message, command: 'WHISPER', id: 'whisper' },
    ],
    'conversation',
  );
  expect(result.length).toBeLessThanOrEqual(5);
  expect(result.some((m) => m.id === 'root')).toBe(true);
  expect(result.every((m) => m.channel === 'one' && m.command !== 'WHISPER')).toBe(true);
});
it('rejects malformed/private imports, merges backups without overwriting notes, and detects stale edits', () => {
  const store = new BookmarkStore();
  store.setAccount('42');
  const entry = store.save(bookmarkMessage(message), [], 'message', 'original', []);
  const backup = store.export();
  store.save(entry.message, [], 'message', 'new', [], entry);
  expect(() => store.save(entry.message, [], 'message', 'stale', [], entry)).toThrow('changed');
  expect(store.import(parseBookmarks(backup))).toBe(0);
  expect(store.list()[0]?.note).toBe('new');
  for (const raw of [
    'bad',
    JSON.stringify({
      format: 'chatty-cat-bookmarks',
      version: 1,
      bookmarks: [{ ...entry, message: { ...entry.message, command: 'WHISPER' } }],
    }),
    JSON.stringify({
      format: 'chatty-cat-bookmarks',
      version: 1,
      bookmarks: [{ ...entry, context: Array(6).fill(entry.message) }],
    }),
  ])
    expect(() => parseBookmarks(raw)).toThrow();
});
it('shares only reviewed fields, omits private notes by default and redacts links and mentions', () => {
  const store = new BookmarkStore();
  store.setAccount('42');
  const entry = store.save(bookmarkMessage(message), [], 'message', 'private secret', []);
  const preview = shareBookmark(entry, {
    message: true,
    author: false,
    time: true,
    context: false,
    note: false,
    links: false,
    mentions: false,
    channel: true,
  });
  expect(preview).not.toContain('private secret');
  expect(preview).not.toContain('example.org');
  expect(preview).not.toContain('@bob');
  expect(preview).not.toContain('alice');
  expect(preview).toContain('https://www.twitch.tv/one');
  expect(preview).not.toContain('mid=');
});
it('preserves only bounded public deletion and timeout metadata in recovered excerpts', () => {
  const store = new BookmarkStore();
  store.setAccount('42');
  const notice = {
    ...message,
    id: 'timeout',
    command: 'CLEARCHAT',
    text: 'alice',
    tags: { 'ban-duration': '600', 'target-msg-id': 'id', secret: 'discard' },
  };
  const entry = store.save(bookmarkMessage(notice), [], 'message', 'private', []),
    copy = recoveredBookmarkMessages(entry)[0]!;
  expect(copy.tags['ban-duration']).toBe('600');
  expect(copy.tags['target-msg-id']).toBe('id');
  expect(JSON.stringify(copy)).not.toContain('private');
  expect(JSON.stringify(copy)).not.toContain('discard');
});
it('enforces bookmark and note limits without silently evicting existing data', () => {
  const store = new BookmarkStore();
  store.setAccount('42');
  for (let i = 0; i < 200; i++) store.save(bookmarkMessage({ ...message, id: String(i) }), [], 'message', '', []);
  const before = store.export();
  expect(() => store.save(bookmarkMessage({ ...message, id: 'overflow' }), [], 'message', '', [])).toThrow('200');
  expect(store.export()).toBe(before);
  expect(() => store.save(bookmarkMessage({ ...message, id: '0' }), [], 'message', 'x'.repeat(2001), [])).toThrow();
  expect(store.export()).toBe(before);
});
