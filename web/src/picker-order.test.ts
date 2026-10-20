import { expect, it } from 'vitest';
import { ageLabel, crossedAges, familyCompare, missedAge } from './picker-order';
import { readFileSync } from 'node:fs';
import { EMOJI_DATA_URL } from './emoji-data-source';

it('preserves the prior English ordering for the complete emoji catalog and mixed emote names', () => {
  const data = JSON.parse(readFileSync('public' + EMOJI_DATA_URL, 'utf8')) as { entries: { code: string }[] };
  const values = data.entries
    .map((entry) => entry.code)
    .concat([
      'FeelsGoodMan',
      'PeepoHappy',
      'FeelsBadMan',
      'peepoSad',
      'KKona',
      'Éclair',
      'eclair',
      '123Go',
      'A_B',
      'áb',
      'aB',
      'I',
      'ı',
      'İ',
    ]);
  const previous = (a: string, b: string): number => {
    const stem = (s: string): string =>
      (s.match(/^[a-z]+|^[A-Z](?![a-z])[A-Z]*|^[A-Z][a-z]+|^[0-9]+/)?.[0] ?? s).toLowerCase();
    const compare = (x: string, y: string): number => x.localeCompare(y, 'en', { sensitivity: 'base' });
    return compare(stem(a), stem(b)) || compare(a, b);
  };
  expect([...values].sort(familyCompare)).toEqual([...values].sort(previous));
});
it('groups family stems case insensitively', () => {
  expect(['FeelsGoodMan', 'PeepoHappy', 'FeelsBadMan', 'peepoSad', 'KKona'].sort(familyCompare)).toEqual([
    'FeelsBadMan',
    'FeelsGoodMan',
    'KKona',
    'PeepoHappy',
    'peepoSad',
  ]);
});
it('uses original second, minute and hour thresholds without duplicates', () => {
  expect(crossedAges(10000, 60000)).toEqual([20, 30, 45, 60]);
  expect([45, 60, 90, 120, 3600].map(ageLabel)).toEqual(['45s', '1m', '90s', '2m', '1h']);
});

it('marks substantial missing observation windows while ignoring brief reload gaps', () => {
  const now = 1000000;
  expect(missedAge(600, now, [{ from: now - 100000, to: now - 10000 }])).toBe(true);
  expect(missedAge(600, now, [{ from: now - 25000, to: now }])).toBe(false);
  expect(missedAge(60, now, [{ from: now - 40000, to: now }])).toBe(true);
  expect(missedAge(60, now, [{ from: 0, to: 1000 }])).toBe(false);
});
