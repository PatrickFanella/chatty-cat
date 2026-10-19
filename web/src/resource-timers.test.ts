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
  measureResourceWork,
  resourceWorkSnapshot,
  measureTimerCallback,
} from './resource-timers';
afterEach(() => {
  sampleIntervals(false);
  resetIntervalSamples();
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

it('records individual synchronous callback maxima and counts over 50 ms, including throws', () => {
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const sample = {
    owner: 'storage.fixture',
    intervalMs: 1000,
    fires: 0,
    hiddenFires: 0,
    callbackMs: 0,
    maxCallbackMs: 0,
    longCallbacks: 0,
  };
  sampleIntervals(true);
  measureTimerCallback(sample, () => {
    now += 50;
  });
  expect(() =>
    measureTimerCallback(sample, () => {
      now += 51;
      throw new Error('fixture');
    }),
  ).toThrow('fixture');
  expect(sample).toMatchObject({ fires: 2, callbackMs: 101, maxCallbackMs: 51, longCallbacks: 1 });
});
it('times explicit boundaries only while recording and preserves returned promises without timing their continuations', async () => {
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  expect(measureResourceWork('inactive', () => 7)).toBe(7);
  expect(resourceWorkSnapshot()).toEqual([]);
  sampleIntervals(true);
  const promise = Promise.resolve().then(() => {
    now += 1000;
  });
  expect(
    measureResourceWork('storage.dispatch.fixture', () => {
      now += 3;
      return promise;
    }),
  ).toBe(promise);
  await promise;
  expect(() =>
    measureResourceWork('chat.render', () => {
      now += 70;
      throw new Error('render');
    }),
  ).toThrow('render');
  expect(resourceWorkSnapshot()).toEqual([
    { owner: 'chat.render', calls: 1, totalMs: 70, maxMs: 70, longCalls: 1 },
    { owner: 'storage.dispatch.fixture', calls: 1, totalMs: 3, maxMs: 3, longCalls: 0 },
  ]);
  const snapshot = resourceWorkSnapshot();
  snapshot[0]!.calls = 999;
  expect(resourceWorkSnapshot()[0]!.calls).toBe(1);
  sampleIntervals(false);
  measureResourceWork('chat.render', () => {
    now += 500;
  });
  expect(resourceWorkSnapshot()[0]!.calls).toBe(1);
  resetIntervalSamples();
  expect(resourceWorkSnapshot()).toEqual([]);
});
it('bounds diagnostic owner retention without retaining arbitrary payloads', () => {
  sampleIntervals(true);
  for (let i = 0; i < 200; i++) measureResourceWork('fixture.' + i, () => {});
  expect(resourceWorkSnapshot()).toHaveLength(128);
  expect(resourceWorkSnapshot().find((sample) => sample.owner === 'other')?.calls).toBe(73);
});
