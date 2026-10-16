import {
  ownedInterval,
  clearOwnedInterval,
  measureTimerCallback,
  registerTimerSample,
  type TimerSample,
} from '../resource-timers';
type Pool = 'ui' | 'storage';
export type ClockStop = () => void;
interface Options {
  pool?: Pool;
  active?: () => boolean;
  flushOnHide?: boolean;
  resume?: boolean;
}
interface Task {
  sample: TimerSample;
  callback: () => void;
  options: Options;
  next: number;
  disposeSample: () => void;
}
export class SharedClock {
  private tasks = new Set<Task>();
  private timers = new Map<Pool, ReturnType<typeof ownedInterval>>();
  private listening = false;
  private hidden = document.hidden;
  subscribe(owner: string, callback: () => void, intervalMs: number, options: Options = {}): ClockStop {
    if (!Number.isFinite(intervalMs) || intervalMs < 1000) throw new Error('Invalid clock cadence');
    const sample: TimerSample = { owner, intervalMs, fires: 0, hiddenFires: 0, callbackMs: 0 };
    const task: Task = {
      sample,
      callback,
      options,
      next: Date.now() + intervalMs,
      disposeSample: registerTimerSample(sample),
    };
    this.tasks.add(task);
    if (!this.listening) {
      this.hidden = document.hidden;
      document.addEventListener('visibilitychange', this.visibility);
      this.listening = true;
    }
    this.refresh();
    return () => {
      if (!this.tasks.delete(task)) return;
      task.disposeSample();
      this.refresh();
      if (!this.tasks.size) {
        document.removeEventListener('visibilitychange', this.visibility);
        this.listening = false;
      }
    };
  }
  private active(task: Task): boolean {
    return !document.hidden && (task.options.active?.() ?? true);
  }
  private run(task: Task): void {
    try {
      measureTimerCallback(task.sample, task.callback);
    } catch (error) {
      reportError(error);
    }
  }
  private tick(pool: Pool): void {
    if (document.hidden) {
      this.refresh();
      return;
    }
    const now = Date.now();
    for (const task of [...this.tasks]) {
      if ((task.options.pool ?? 'ui') !== pool || now < task.next) continue;
      task.next += (Math.floor((now - task.next) / task.sample.intervalMs) + 1) * task.sample.intervalMs;
      if (this.tasks.has(task) && this.active(task)) this.run(task);
    }
    this.refresh();
  }
  refresh(): void {
    for (const pool of ['ui', 'storage'] as const) {
      const needed = [...this.tasks].some((task) => (task.options.pool ?? 'ui') === pool && this.active(task));
      if (needed && !this.timers.has(pool))
        this.timers.set(
          pool,
          ownedInterval('scheduler.' + pool, () => this.tick(pool), 1000),
        );
      if (!needed) {
        clearOwnedInterval(this.timers.get(pool));
        this.timers.delete(pool);
      }
    }
  }
  private visibility = (): void => {
    const hidden = document.hidden;
    if (hidden === this.hidden) return;
    this.hidden = hidden;
    this.refresh();
    for (const task of [...this.tasks]) {
      if (!this.tasks.has(task)) continue;
      task.next = Date.now() + task.sample.intervalMs;
      if (hidden ? task.options.flushOnHide : task.options.resume !== false && this.active(task)) this.run(task);
    }
  };
  snapshot(): (TimerSample & { pool: Pool; active: boolean })[] {
    return [...this.tasks]
      .map((task) => ({ ...task.sample, pool: task.options.pool ?? 'ui', active: this.active(task) }))
      .sort((a, b) => a.owner.localeCompare(b.owner));
  }
}
let clock: SharedClock | undefined;
export function clockTask(owner: string, callback: () => void, intervalMs: number, options?: Options): ClockStop {
  clock ??= new SharedClock();
  return clock.subscribe(owner, callback, intervalMs, options);
}
export function stopClockTask(stop: ClockStop | undefined): void {
  stop?.();
}
export function refreshClock(): void {
  clock?.refresh();
}
export function clockSnapshot() {
  return clock?.snapshot() ?? [];
}
