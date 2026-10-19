type Timer = ReturnType<typeof setInterval>;
export interface TimerSample {
  owner: string;
  intervalMs: number;
  fires: number;
  hiddenFires: number;
  callbackMs: number;
  maxCallbackMs: number;
  longCallbacks: number;
}
const timers = new Map<Timer, TimerSample>();
const taskSamples = new Set<TimerSample>();
const deadlines = new Map<ReturnType<typeof setTimeout>, { owner: string; at: number }>();
export function ownedDeadline(owner: string, callback: () => void, delayMs: number): ReturnType<typeof setTimeout> {
  const timer = setTimeout(() => {
    deadlines.delete(timer);
    callback();
  }, delayMs);
  deadlines.set(timer, { owner, at: Date.now() + delayMs });
  return timer;
}
export function clearOwnedDeadline(timer: ReturnType<typeof setTimeout> | undefined): void {
  if (timer === undefined) return;
  clearTimeout(timer);
  deadlines.delete(timer);
}
export function deadlineSnapshot(): { owner: string; dueInMs: number }[] {
  return [...deadlines.values()]
    .map((row) => ({ owner: row.owner, dueInMs: Math.max(0, row.at - Date.now()) }))
    .sort((a, b) => a.owner.localeCompare(b.owner));
}
let sampling = false;
export function registerTimerSample(sample: TimerSample): () => void {
  taskSamples.add(sample);
  return () => {
    taskSamples.delete(sample);
  };
}
export function measureTimerCallback(sample: TimerSample, callback: () => void): void {
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
    const elapsed = performance.now() - start;
    sample.callbackMs += elapsed;
    sample.maxCallbackMs = Math.max(sample.maxCallbackMs, elapsed);
    if (elapsed > 50) sample.longCallbacks++;
  }
}

// Preserve the native handle/cadence. Sampling covers synchronous callback work,
// not async work initiated by the callback. No browser globals are patched.
export function ownedInterval(owner: string, callback: () => void, intervalMs: number): Timer {
  const sample: TimerSample = {
    owner,
    intervalMs,
    fires: 0,
    hiddenFires: 0,
    callbackMs: 0,
    maxCallbackMs: 0,
    longCallbacks: 0,
  };
  const timer = setInterval(() => {
    measureTimerCallback(sample, callback);
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
  workSamples.clear();
  for (const sample of [...timers.values(), ...taskSamples]) {
    sample.fires = 0;
    sample.hiddenFires = 0;
    sample.callbackMs = 0;
    sample.maxCallbackMs = 0;
    sample.longCallbacks = 0;
  }
}
export function intervalSnapshot(): TimerSample[] {
  return [...timers.values()].map((sample) => ({ ...sample })).sort((a, b) => a.owner.localeCompare(b.owner));
}

export interface WorkSample {
  owner: string;
  calls: number;
  totalMs: number;
  maxMs: number;
  longCalls: number;
}
const workSamples = new Map<string, WorkSample>();
// Explicit synchronous boundaries only. Returned promises are not awaited or timed.
// Callers use fixed operation names; no messages, accounts or stacks are retained.
export function measureResourceWork<T>(owner: string, callback: () => T): T {
  if (!sampling) return callback();
  const key = workSamples.has(owner) || workSamples.size < 127 ? owner : 'other';
  let sample = workSamples.get(key);
  if (!sample) {
    sample = { owner: key, calls: 0, totalMs: 0, maxMs: 0, longCalls: 0 };
    workSamples.set(key, sample);
  }
  const start = performance.now();
  sample.calls++;
  try {
    return callback();
  } finally {
    const elapsed = performance.now() - start;
    sample.totalMs += elapsed;
    sample.maxMs = Math.max(sample.maxMs, elapsed);
    if (elapsed > 50) sample.longCalls++;
  }
}
export function resourceWorkSnapshot(): WorkSample[] {
  return [...workSamples.values()].map((sample) => ({ ...sample })).sort((a, b) => a.owner.localeCompare(b.owner));
}
