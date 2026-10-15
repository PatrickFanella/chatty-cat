import { expect, it } from 'vitest';
import { ObservationCoverage } from './observation-coverage';
it('tracks only connected sources and never fills disconnects, inactive channels or paused timer gaps', () => {
  const c = new ObservationCoverage(['one', 'two'], 100000);
  c.setSources(['one'], 100000);
  c.status(true, 100000);
  c.tick(101000);
  c.tick(104000);
  expect(c.snapshot(104000)).toEqual([{ channel: 'one', from: 100, to: 104 }]);
  c.tick(120000);
  c.tick(121000);
  expect(c.snapshot(121000)).toEqual([
    { channel: 'one', from: 100, to: 104 },
    { channel: 'one', from: 120, to: 121 },
  ]);
  c.setSources(['two'], 121000);
  c.tick(123000);
  c.status(true, 123000);
  c.tick(124000);
  expect(c.snapshot(124000).at(-1)).toEqual({ channel: 'two', from: 123, to: 124 });
  c.status(false, 124000);
  c.tick(125000);
  expect(c.snapshot(125000).at(-1)?.to).toBe(124);
});
it('restores bounded completed intervals without inventing page-closed or partial-second coverage', () => {
  const c = new ObservationCoverage(['one'], 110000);
  c.restore([{ channel: 'one', from: 100, to: 105 }], 110000);
  c.status(true, 110500);
  c.tick(111000);
  c.tick(112000);
  expect(c.snapshot(112000)).toEqual([
    { channel: 'one', from: 100, to: 105 },
    { channel: 'one', from: 111, to: 112 },
  ]);
  const bad = new ObservationCoverage(['one'], 110000);
  bad.restore([{ channel: 'other', from: 100, to: 105 }], 110000);
  expect(bad.snapshot(110000)).toEqual([]);
  bad.restore(Array(24001).fill({ channel: 'one', from: 100, to: 105 }), 110000);
  expect(bad.snapshot(110000)).toEqual([]);
});
it('keeps snapshots within their restore bound when a new active interval follows a full retained buffer', () => {
  const c = new ObservationCoverage(['one'], 110000);
  c.restore(Array(24000).fill({ channel: 'one', from: 100, to: 105 }), 110000);
  c.status(true, 110000);
  c.tick(111000);
  const snapshot = c.snapshot(111000);
  expect(snapshot).toHaveLength(24000);
  expect(snapshot.at(-1)).toEqual({ channel: 'one', from: 110, to: 111 });
});
