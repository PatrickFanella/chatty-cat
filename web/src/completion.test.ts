import { expect, it } from 'vitest';
import { completions, insertCompletion, wireMessage } from './completion';
import { completionDefaults } from './completion-preferences';
it('completes nicknames case-insensitively at the caret', () => {
  expect(completions('hi @vi', 6, 6, ['viewer', 'Violet', 'viewer'], [])?.items.map((item) => item.value)).toEqual([
    '@viewer',
    '@Violet',
  ]);
  expect(completions('@v', 1, 2, ['viewer'], [])).toBeUndefined();
});
it('offers colon and bare emotes and preserves exact provider spelling', () => {
  expect(completions(':ka', 3, 3, [], ['Kappa'])?.items[0]?.value).toBe('Kappa');
  expect(completions('Kap', 3, 3, [], ['Kappa'])).toBeUndefined();
  expect(completions('Kap', 3, 3, [], ['Kappa'], true)?.items[0]?.value).toBe('Kappa');
  expect(completions('Ka', 2, 2, [], ['Kappa'], true)).toBeUndefined();
});
it('inserts into the active word without losing following text or Unicode', () => {
  const text = '😀 @vi there';
  const result = completions(text, 6, 6, ['viewer'], []);
  expect(result).toBeDefined();
  expect(insertCompletion(text, result!, 0)).toEqual({ text: '😀 @viewer there', caret: 10 });
});
it('bounds suggestions and converts multiline drafts into a single chat line', () => {
  expect(
    completions(
      '@v',
      2,
      2,
      Array.from({ length: 50 }, (_, i) => 'viewer' + i),
      [],
    )?.items,
  ).toHaveLength(30);
  expect(wireMessage('  one\ntwo\r\nthree  ')).toBe('one two three');
});
it('completes custom triggers only at the beginning and keeps caret insertion safe', () => {
  const result = completions('/gre', 4, 4, [], [], false, ['/greet', '/good']);
  expect(result?.items[0]).toEqual({ value: '/greet', kind: 'command' });
  expect(insertCompletion('/gre after', result!, 0).text).toBe('/greet after');
  expect(completions('hi /gre', 7, 7, [], [], false, ['/greet'])).toBeUndefined();
});
it('matches local aliases and fuzzy prefixes while inserting only real Twitch logins', () => {
  const options = { ...completionDefaults, mode: 'fuzzy' as const, aliases: [{ login: 'patrick__eff', alias: 'Pat' }] };
  const alias = completions('@pat', 4, 4, ['patrick__eff'], [], false, [], options);
  expect(alias?.items[0]).toMatchObject({ value: '@patrick__eff', label: 'Pat · patrick__eff', kind: 'nickname' });
  expect(completions('@ptf', 4, 4, ['patrick__eff'], [], false, [], options)?.items[0]?.value).toBe('@patrick__eff');
  expect(insertCompletion('@pat end', alias!, 0, { ...options, mentionComma: true })).toEqual({
    text: '@patrick__eff, end',
    caret: 14,
  });
});
it('orders preferred emotes, supports bare names and configurable spacing, and preserves command completion', () => {
  const options = { ...completionDefaults, emotePriority: ['Kappa'], bareNames: true, appendSpace: false };
  const result = completions('kap', 3, 3, ['kapuser'], ['Kapp', 'Kappa'], true, [], options);
  expect(result?.items[0]?.value).toBe('Kappa');
  expect(result?.items.some((x) => x.value === '@kapuser')).toBe(true);
  expect(insertCompletion('kap', result!, 0, options).text).toBe('Kappa');
  expect(completions('/hl', 3, 3, [], [], true, ['/hello'], { ...options, mode: 'fuzzy' })?.items[0]?.value).toBe(
    '/hello',
  );
});
it('does not replace a partial grapheme at the caret', () => {
  expect(completions(':👩‍💻', 3, 3, [], ['👩‍💻'], false)).toBeUndefined();
});
it('honors colon and automatic username-menu policy while preserving explicit Tab completion', () => {
  expect(
    completions(':ka', 3, 3, [], ['Kappa'], false, [], { ...completionDefaults, emoteWithColon: false }),
  ).toBeUndefined();
  expect(
    completions('@al', 3, 3, ['alice'], [], false, [], { ...completionDefaults, usernameMenu: false }),
  ).toBeUndefined();
  expect(
    completions('@al', 3, 3, ['alice'], [], true, [], { ...completionDefaults, usernameMenu: false })?.items[0]?.value,
  ).toBe('@alice');
});
it('can disable preferred-emote ranking without discarding the configured priorities', () => {
  const options = { ...completionDefaults, smartEmotes: false, emotePriority: ['Kappa'] };
  expect(completions(':kap', 4, 4, [], ['Kappa', 'Kapp'], false, [], options)?.items[0]?.value).toBe('Kapp');
  expect(options.emotePriority).toEqual(['Kappa']);
});
