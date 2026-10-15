import { expect, it } from 'vitest';
import { parseRules, RuleEngine, compilePattern, type MessageRule } from './rules';
import type { ChatMessage } from './protocol';
const m: ChatMessage = {
  id: '1',
  channel: 'one',
  login: 'alice',
  command: 'PRIVMSG',
  text: 'Hello chat',
  timestamp: 100,
  tags: { badges: 'moderator/1' },
};
const rule = (id: string, patch: Partial<MessageRule> = {}): MessageRule => ({
  id,
  name: id,
  enabled: true,
  field: 'phrase',
  pattern: 'hello',
  regex: false,
  caseSensitive: false,
  action: 'highlight',
  color: '#aabbcc',
  sound: false,
  notify: false,
  inbox: false,
  scope: 'global',
  ...patch,
});
it('previews ordered rules, matches all supported fields and counts observed messages once', () => {
  const engine = new RuleEngine([
    rule('phrase', { sound: true }),
    rule('author', { field: 'author', pattern: 'alice', color: '#112233', inbox: true }),
    rule('badge', { field: 'badge', pattern: 'moderator', notify: true }),
    rule('type', { field: 'type', pattern: 'PRIVMSG' }),
  ]);
  expect(engine.evaluate(m).highlight).toBe(true);
  expect(engine.evaluate(m).inbox).toBe(true);
  expect(engine.counts()).toEqual({});
  engine.observe(m);
  engine.observe(m);
  expect(engine.counts()).toEqual({ phrase: 1, author: 1, badge: 1, type: 1 });
  const hidden = new RuleEngine([rule('hide', { action: 'ignore' }), rule('later')]);
  expect(hidden.evaluate(m)).toMatchObject({ hidden: true, highlight: false, sound: false });
});
it('isolates pane rules and enforces case matching without changing messages', () => {
  const e = new RuleEngine([rule('pane', { scope: 'pane', action: 'ignore' }), rule('case', { caseSensitive: true })]);
  expect(e.evaluate(m).hidden).toBe(false);
  expect(e.evaluate(m, ['pane']).hidden).toBe(true);
  expect(m.text).toBe('Hello chat');
});
it('rejects dangerous and excessive regex while accepting the documented bounded subset', () => {
  for (const pattern of ['(a+)+$', 'a*', '(hello)', 'x{999999}', 'a.*b.*c', '(?=x)', '\\1'])
    expect(() => compilePattern(pattern, true, false)).toThrow();
  expect(compilePattern('^hello.*chat$', true, false)('Hello great chat')).toBe(true);
  expect(() => compilePattern('[a-z]+', true, false)).toThrow();
  expect(() => parseRules({ rules: Array.from({ length: 33 }, (_, i) => rule(String(i))) })).toThrow();
  expect(() => parseRules({ rules: [rule('x', { color: 'url(evil)' })] })).toThrow();
});
