import { expect, it } from 'vitest';
import { PickerCoverage } from './picker-coverage';

it('marks an age only when one interruption exceeds 30 seconds or one eighth of its window', () => {
  const coverage = new PickerCoverage(undefined, 100000);
  coverage.connected(true, 100000);
  coverage.connected(false, 110000); coverage.connected(false, 120000);
  expect(coverage.missed(60, 140000)).toBe(false);
  expect(coverage.missed(60, 140001)).toBe(true);
  coverage.connected(true, 150000);
  expect(coverage.missed(60, 160000)).toBe(true);
  expect(coverage.missed(60, 180000)).toBe(false);
  expect(coverage.missed(600, 160000)).toBe(false);
  expect(coverage.observed(130000, 160000)).toBe(false);
  expect(coverage.observed(155000, 160000)).toBe(true);
  expect(coverage.observed(90000, 160000)).toBe(false);
});
it('restores closed-page gaps, coalesces overlapping windows, and rejects invalid saved data', () => {
  const coverage = new PickerCoverage({ savedAt: 100000, gaps: [[60000, 100000]] }, 140000);
  coverage.connected(true, 150000);
  expect(coverage.snapshot(160000).gaps).toEqual([[60000, 150000]]);
  expect(coverage.missed(120, 160000)).toBe(true);
  for (const saved of [null, { savedAt: Infinity }, { savedAt: 200000, gaps: [[0, Infinity], [100000, 90000], ['bad', 100000]] }]) {
    const fresh = new PickerCoverage(saved, 140000); fresh.connected(true, 140000);
    expect(fresh.missed(120, 150000)).toBe(false);
  }
});
it('bounds retained gaps and expires windows older than the picker ladder', () => {
  const coverage = new PickerCoverage(undefined, 100000);
  coverage.connected(true, 100000);
  for (let i = 0; i < 100; i++) { coverage.connected(false, 101000 + i * 2000); coverage.connected(true, 102000 + i * 2000); }
  expect(coverage.snapshot(400000).gaps.length).toBeLessThanOrEqual(50);
  expect(coverage.snapshot(50000000).gaps).toEqual([]);
});
