// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import type { ChatMessage } from './protocol';
import { ThreadMessages, ThreadViews, threadKey } from './threads';
const root: ChatMessage = {
  id: 'root',
  channel: 'one',
  command: 'PRIVMSG',
  login: 'alice',
  text: 'root text',
  timestamp: 1,
  tags: {},
};
function child(id: string, parent = 'root'): ChatMessage {
  return { ...root, id, login: 'bob', timestamp: 2, text: 'child ' + id, tags: { 'reply-parent-msg-id': parent } };
}
afterEach(() => localStorage.clear());
it('reconstructs parent chains, discloses missing parents, and deduplicates replay by channel and ID', () => {
  const data = new ThreadMessages('one', 'root');
  data.observe(child('first'));
  data.observe(child('second', 'first'));
  data.observe({
    ...child('orphan', 'missing'),
    tags: { 'reply-parent-msg-id': 'missing', 'reply-thread-parent-msg-id': 'root' },
  });
  expect(data.missing()).toEqual(['root', 'missing']);
  data.observe(root);
  expect(data.observe(child('first'))).toBe(false);
  expect(data.observe({ ...child('other'), channel: 'two' })).toBe(false);
  expect(data.observe({ ...child('whisper'), command: 'WHISPER' })).toBe(false);
  expect(data.rows().map((m) => m.id)).toEqual(['root', 'first', 'orphan', 'second']);
});
it('redacts deletion and channel-scoped timeout state from display, search and public copy including late replay', () => {
  const data = new ThreadMessages('one', 'root');
  data.observe({ ...root, command: 'CLEARMSG', tags: { 'target-msg-id': 'late' } });
  data.observe(child('late'));
  expect(data.removed(child('late'))).toBe(true);
  data.observe(root);
  data.observe(child('first'));
  data.observe({ ...root, command: 'CLEARCHAT', text: 'bob', timestamp: 3 });
  expect(data.context()).not.toContain('child');
  expect(data.matches(child('first'), 'child')).toBe(false);
  expect(data.removed(root)).toBe(false);
  data.observe({ ...root, channel: 'two', command: 'CLEARCHAT', text: '', timestamp: 99 });
  expect(data.removed(root)).toBe(false);
  data.observe({ ...root, command: 'CLEARCHAT', text: '', timestamp: 3 });
  expect(data.removed(root)).toBe(true);
});
it('caps threads at 500 public messages and retains moderation for accepted rows', () => {
  const data = new ThreadMessages('one', 'root');
  data.observe(root);
  for (let i = 0; i < 600; i++) data.observe(child(String(i)));
  expect(data.messages.size).toBe(500);
  expect(data.truncated).toBe(true);
  data.observe({ ...root, command: 'CLEARMSG', tags: { 'target-msg-id': '0' } });
  expect(data.removed(child('0'))).toBe(true);
});
it('persists multiple views and identity-based unread state across reload, account and workspace boundaries', () => {
  const views = new ThreadViews();
  views.setScope('42', 'workspace');
  const view = views.open('one', 'root'),
    data = new ThreadMessages('one', 'root');
  data.observe(root);
  data.observe(child('read'));
  views.markRead(view, data);
  data.observe({ ...child('late'), timestamp: 1 });
  expect(views.unread(view, data)).toBe(1);
  views.open('two', 'root');
  const again = new ThreadViews();
  again.setScope('42', 'workspace');
  expect(again.state.views).toHaveLength(2);
  expect(again.unread(again.state.views[0]!, data)).toBe(1);
  again.setScope('43', 'workspace');
  expect(again.state.views).toEqual([]);
  again.setScope('42', 'other');
  expect(again.state.views).toEqual([]);
  again.setScope('42', 'workspace');
  again.close(threadKey(view));
  expect(again.state.views).toHaveLength(1);
});
it('validates saved state and refuses extra views without evicting existing views', () => {
  const views = new ThreadViews();
  views.setScope('42', 'workspace');
  for (let i = 0; i < 8; i++) views.open('one', String(i));
  expect(() => views.open('one', 'overflow')).toThrow('8');
  expect(views.state.views).toHaveLength(8);
  localStorage.setItem(
    views.key!,
    JSON.stringify({ views: [{ channel: 'bad channel', root: 'root', read: [] }], active: '', open: true }),
  );
  expect(() => views.reload()).toThrow('invalid');
});
it('reconciles authoritative echoes and deletion flags without creating duplicate unread replies', () => {
  const data = new ThreadMessages('one', 'root'),
    echo = { ...child('echo'), tags: { ...child('echo').tags, 'local-echo': '1' } };
  data.observe(echo);
  expect(data.observe({ ...child('echo'), text: 'authoritative' })).toBe(true);
  expect(data.rows()).toHaveLength(1);
  expect(data.rows()[0]?.text).toBe('authoritative');
  expect(data.observe({ ...child('echo'), tags: { ...child('echo').tags, deleted: 'true' } })).toBe(true);
  expect(data.removed(child('echo'))).toBe(true);
});
