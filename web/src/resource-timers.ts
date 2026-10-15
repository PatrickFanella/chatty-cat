type Timer = ReturnType<typeof setInterval>;
export interface TimerSample {
  owner: string;
  intervalMs: number;
  fires: number;
  hiddenFires: number;
  callbackMs: number;
}
const timers = new Map<Timer, TimerSample>();
let sampling = false;

// Preserve the native handle/cadence. Sampling covers synchronous callback work,
// not async work initiated by the callback. No browser globals are patched.
export function ownedInterval(owner: string, callback: () => void, intervalMs: number): Timer {
  const sample: TimerSample = { owner, intervalMs, fires: 0, hiddenFires: 0, callbackMs: 0 };
  const timer = setInterval(() => {
    if (!sampling) {
      callback();
      return;
    }
    const start = performance.now();
    sample.fires++;
    if (document.hidden) sample.hiddenFires++;
    try {
      callback();
    } finally {
      sample.callbackMs += performance.now() - start;
    }
  }, intervalMs);
  timers.set(timer, sample);
  return timer;
}
export function clearOwnedInterval(timer: Timer | undefined): void {
  if (timer === undefined) return;
  clearInterval(timer);
  timers.delete(timer);
}
export function sampleIntervals(active: boolean): void {
  sampling = active;
}
export function resetIntervalSamples(): void {
  for (const sample of timers.values()) {
    sample.fires = 0;
    sample.hiddenFires = 0;
    sample.callbackMs = 0;
  }
}
export function intervalSnapshot(): TimerSample[] {
  return [...timers.values()].map((sample) => ({ ...sample })).sort((a, b) => a.owner.localeCompare(b.owner));
}
