// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { ResourceReadout } from './resource-readout';
import { clearOwnedInterval, ownedInterval } from './resource-timers';
let readout: ResourceReadout | undefined;
afterEach(() => {
  readout?.stop();
  readout = undefined;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it('reports unsupported metrics honestly and adds no refresh timer', () => {
  vi.useFakeTimers();
  vi.stubGlobal('PerformanceObserver', undefined);
  readout = new ResourceReadout(() => ({ mountedRows: 8, rowCache: 64, retainedMessages: 1000 }));
  readout.open();
  expect(readout.snapshot()).toMatchObject({
    mountedRows: 8,
    rowCache: 64,
    retainedMessages: 1000,
    longTasks: 'unavailable',
    repeatingTimers: 0,
  });
  expect(vi.getTimerCount()).toBe(0);
  const timer = ownedInterval('fixture.ui', () => {}, 1000);
  vi.advanceTimersByTime(2000);
  const pickerEscape = vi.fn((event: Event) => event.stopPropagation());
  document.addEventListener('keydown', pickerEscape, true);
  readout.root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(readout.root.open).toBe(false);
  expect(pickerEscape).not.toHaveBeenCalled();
  document.removeEventListener('keydown', pickerEscape, true);
  expect(readout.snapshot()).toMatchObject({ recording: false, timers: [expect.objectContaining({ fires: 2 })] });
  vi.advanceTimersByTime(2000);
  expect(readout.snapshot()).toMatchObject({ timers: [expect.objectContaining({ fires: 2 })] });
  clearOwnedInterval(timer);
});
it('aggregates long tasks without retaining entries and releases the observer on close', () => {
  let callback: PerformanceObserverCallback | undefined;
  const disconnect = vi.fn();
  const takeRecords = vi.fn(() => []);
  class Observer {
    static supportedEntryTypes = ['longtask'];
    constructor(cb: PerformanceObserverCallback) {
      callback = cb;
    }
    observe = vi.fn();
    disconnect = disconnect;
    takeRecords = takeRecords;
  }
  vi.stubGlobal('PerformanceObserver', Observer);
  readout = new ResourceReadout(() => ({ mountedRows: 0, rowCache: 0, retainedMessages: 0 }));
  readout.open();
  callback!(
    { getEntries: () => [{ duration: 60 }, { duration: 120 }] } as unknown as PerformanceObserverEntryList,
    {} as PerformanceObserver,
  );
  expect(readout.snapshot()).toMatchObject({ longTasks: { count: 2, totalMs: 180, maxMs: 120 } });
  readout.root.querySelector<HTMLButtonElement>('[data-reset]')!.click();
  expect(readout.snapshot()).toMatchObject({ longTasks: { count: 0, totalMs: 0, maxMs: 0 } });
  readout.root.close();
  expect(disconnect).toHaveBeenCalledTimes(1);
});
