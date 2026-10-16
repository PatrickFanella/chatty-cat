// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { SharedClock } from './clock';
import { intervalSnapshot, sampleIntervals, resetIntervalSamples } from '../resource-timers';
const stops: (() => void)[] = [];
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  sampleIntervals(false);
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it('shares two native timers, honors task cadences and skips closed views', () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const clock = new SharedClock();
  const fast = vi.fn(),
    slow = vi.fn(),
    save = vi.fn();
  let open = false;
  stops.push(
    clock.subscribe('fast', fast, 1000),
    clock.subscribe('slow', slow, 5000, { active: () => open }),
    clock.subscribe('save', save, 3000, { pool: 'storage' }),
  );
  expect(intervalSnapshot().map((x) => x.owner)).toEqual(['scheduler.storage', 'scheduler.ui']);
  vi.advanceTimersByTime(5000);
  expect(fast).toHaveBeenCalledTimes(5);
  expect(slow).not.toHaveBeenCalled();
  expect(save).toHaveBeenCalledOnce();
  open = true;
  clock.refresh();
  vi.advanceTimersByTime(5000);
  expect(slow).toHaveBeenCalledOnce();
  stops.splice(0).forEach((stop) => stop());
  expect(intervalSnapshot()).toEqual([]);
});
it('flushes storage once on hide, stops both clocks, and resumes without catch-up bursts', () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  let hidden = false;
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  const clock = new SharedClock();
  const paint = vi.fn(),
    save = vi.fn();
  stops.push(
    clock.subscribe('paint', paint, 1000),
    clock.subscribe('save', save, 15000, { pool: 'storage', flushOnHide: true }),
  );
  sampleIntervals(true);
  vi.advanceTimersByTime(2000);
  hidden = true;
  document.dispatchEvent(new Event('visibilitychange'));
  expect(intervalSnapshot()).toEqual([]);
  expect(save).toHaveBeenCalledOnce();
  document.dispatchEvent(new Event('visibilitychange'));
  vi.advanceTimersByTime(60000);
  expect(paint).toHaveBeenCalledTimes(2);
  expect(save).toHaveBeenCalledOnce();
  expect(clock.snapshot().every((task) => !task.active)).toBe(true);
  hidden = false;
  document.dispatchEvent(new Event('visibilitychange'));
  expect(paint).toHaveBeenCalledTimes(3);
  expect(save).toHaveBeenCalledTimes(2);
  expect(intervalSnapshot()).toHaveLength(2);
  vi.advanceTimersByTime(1000);
  expect(paint).toHaveBeenCalledTimes(4);
  expect(save).toHaveBeenCalledTimes(2);
  expect(clock.snapshot().find((x) => x.owner === 'save')).toMatchObject({ fires: 2, hiddenFires: 1 });
  resetIntervalSamples();
  expect(clock.snapshot().every((x) => x.fires === 0)).toBe(true);
});
it('does not wake for inactive-only tasks and isolates failed callbacks from other subscribers', () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const clock = new SharedClock();
  let open = false;
  const paint = vi.fn();
  stops.push(clock.subscribe('closed', paint, 1000, { active: () => open }));
  expect(intervalSnapshot()).toEqual([]);
  open = true;
  clock.refresh();
  const error = vi.fn();
  vi.stubGlobal('reportError', error);
  stops.push(
    clock.subscribe(
      'bad',
      () => {
        throw new Error('fixture');
      },
      1000,
    ),
  );
  vi.advanceTimersByTime(1000);
  expect(paint).toHaveBeenCalledOnce();
  expect(error).toHaveBeenCalledOnce();
  vi.unstubAllGlobals();
});
