import { expect, it } from 'vitest';
import { ageLabel, crossedAges, familyCompare } from './picker-order';
it('groups family stems case insensitively', () => {
  expect(['FeelsGoodMan', 'PeepoHappy', 'FeelsBadMan', 'peepoSad', 'KKona'].sort(familyCompare)).toEqual(['FeelsBadMan', 'FeelsGoodMan', 'KKona', 'PeepoHappy', 'peepoSad']);
});
it('uses original second, minute and hour thresholds without duplicates', () => {
  expect(crossedAges(10000, 60000)).toEqual([20, 30, 45, 60]);
  expect([45, 60, 90, 120, 3600].map(ageLabel)).toEqual(['45s', '1m', '90s', '2m', '1h']);
});
