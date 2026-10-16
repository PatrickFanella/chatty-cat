// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import {
  ownedDeadline,
  clearOwnedDeadline,
  deadlineSnapshot,
  clearOwnedInterval,
  intervalSnapshot,
  ownedInterval,
  resetIntervalSamples,
  sampleIntervals,
} from './resource-timers';
afterEach(() => {
  sampleIntervals(false);
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it('preserves cadence, counts hidden callbacks only while sampling and removes stopped timers', () => {
  vi.useFakeTimers();
  const callback = vi.fn();
  const timer = ownedInterval('fixture.poll', callback, 50);
  vi.advanceTimersByTime(100);
  expect(callback).toHaveBeenCalledTimes(2);
  expect(intervalSnapshot().find((t) => t.owner === 'fixture.poll')?.fires).toBe(0);
  sampleIntervals(true);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  vi.advanceTimersByTime(150);
  expect(intervalSnapshot().find((t) => t.owner === 'fixture.poll')).toMatchObject({
    fires: 3,
    hiddenFires: 3,
    intervalMs: 50,
  });
  const copy = intervalSnapshot();
  copy[0]!.fires = 999;
  expect(intervalSnapshot()[0]!.fires).toBe(3);
  resetIntervalSamples();
  expect(intervalSnapshot()[0]!.fires).toBe(0);
  clearOwnedInterval(timer);
  clearOwnedInterval(undefined);
  vi.advanceTimersByTime(100);
  expect(callback).toHaveBeenCalledTimes(5);
  expect(intervalSnapshot()).toEqual([]);
});

it('reports protocol deadlines separately and removes fired or cancelled deadlines', () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const callback = vi.fn();
  ownedDeadline('protocol', callback, 25000);
  const cancelled = ownedDeadline('cancelled', callback, 1000);
  clearOwnedDeadline(cancelled);
  expect(deadlineSnapshot()).toEqual([{ owner: 'protocol', dueInMs: 25000 }]);
  expect(intervalSnapshot()).toEqual([]);
  vi.advanceTimersByTime(25000);
  expect(callback).toHaveBeenCalledOnce();
  expect(deadlineSnapshot()).toEqual([]);
});
