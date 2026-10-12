import { AGE_SECONDS } from './picker-order';

type Gap = [start: number, end: number];
type State = { kind: 'connected' } | { kind: 'interrupted'; since: number };
const RETENTION = (AGE_SECONDS.at(-1) ?? 43200) * 1000;
function stamp(value: unknown, now: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= now;
}

export class PickerCoverage {
  private gaps: Gap[] = [];
  private state: State;
  constructor(saved: unknown, private readonly started = Date.now()) {
    this.state = { kind: 'interrupted', since: started };
    if (!saved || typeof saved !== 'object') return;
    if ('gaps' in saved && Array.isArray(saved.gaps)) for (const gap of saved.gaps.slice(-50)) {
      if (Array.isArray(gap) && gap.length === 2 && stamp(gap[0], started) && stamp(gap[1], started) && gap[0] < gap[1]) this.gaps.push([gap[0], gap[1]]);
    }
    if ('savedAt' in saved && stamp(saved.savedAt, started) && saved.savedAt < started) this.gaps.push([saved.savedAt, started]);
    this.compact(started);
  }
  connected(on: boolean, now = Date.now()): void {
    if (on && this.state.kind === 'interrupted') {
      if (this.state.since < now) this.gaps.push([this.state.since, now]);
      this.state = { kind: 'connected' };
    } else if (!on && this.state.kind === 'connected') this.state = { kind: 'interrupted', since: now };
    this.compact(now);
  }
  missed(seconds: number, now = Date.now()): boolean {
    const window = seconds * 1000;
    const floor = Math.max(30000, window / 8);
    return this.windows(now).some(([start, end]) => Math.min(end, now) - Math.max(start, now - window) > floor);
  }
  observed(timestamp: number, now = Date.now()): boolean {
    return timestamp >= this.started && timestamp <= now && !this.windows(now).some(([start, end]) => timestamp >= start && timestamp <= end);
  }
  snapshot(now = Date.now()): { savedAt: number; gaps: Gap[] } {
    return { savedAt: now, gaps: this.windows(now).map(([start, end]) => [start, end]) };
  }
  private windows(now: number): Gap[] {
    this.compact(now);
    if (this.state.kind === 'connected') return this.gaps;
    const pending: Gap = [this.state.since, now];
    const last = this.gaps.at(-1);
    return last && last[1] >= pending[0] ? [...this.gaps.slice(0, -1), [last[0], now]] : [...this.gaps, pending];
  }
  private compact(now: number): void {
    const merged: Gap[] = [];
    for (const gap of this.gaps.filter(([, end]) => end >= now - RETENTION).sort((a, b) => a[0] - b[0])) {
      const last = merged.at(-1);
      if (last && gap[0] <= last[1]) last[1] = Math.max(last[1], gap[1]);
      else merged.push([...gap]);
    }
    // Keep bounded coverage conservatively rather than forget old interruptions.
    while (merged.length > 49) { const first = merged.shift(), second = merged[0]; if (first && second) second[0] = first[0]; }
    this.gaps = merged;
  }
}
