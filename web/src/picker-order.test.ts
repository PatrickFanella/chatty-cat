import { expect, it } from 'vitest';
import { ageLabel, crossedAges, familyCompare, missedAge } from './picker-order';
it('groups family stems case insensitively', () => {
  expect(['FeelsGoodMan', 'PeepoHappy', 'FeelsBadMan', 'peepoSad', 'KKona'].sort(familyCompare)).toEqual(['FeelsBadMan', 'FeelsGoodMan', 'KKona', 'PeepoHappy', 'peepoSad']);
});
it('uses original second, minute and hour thresholds without duplicates', () => {
  expect(crossedAges(10000, 60000)).toEqual([20, 30, 45, 60]);
  expect([45, 60, 90, 120, 3600].map(ageLabel)).toEqual(['45s', '1m', '90s', '2m', '1h']);
});

it('marks substantial missing observation windows while ignoring brief reload gaps',()=>{
 const now=1000000;expect(missedAge(600,now,[{from:now-100000,to:now-10000}])).toBe(true);expect(missedAge(600,now,[{from:now-25000,to:now}])).toBe(false);expect(missedAge(60,now,[{from:now-40000,to:now}])).toBe(true);expect(missedAge(60,now,[{from:0,to:1000}])).toBe(false);
});
