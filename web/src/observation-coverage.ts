export interface ObservationSpan {
  channel: string;
  from: number;
  to: number;
}
const KEEP = 86400,
  MAX = 24000;
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
// Seconds are half-open receipt-time intervals, never inferred from stored messages.
export class ObservationCoverage {
  private spans: ObservationSpan[] = [];
  private active = new Map<string, ObservationSpan>();
  private sources: Set<string>;
  private connected = false;
  private last: number;
  private started: number;
  constructor(
    private channels: readonly string[],
    now = Date.now(),
  ) {
    this.started = this.last = Math.floor(now / 1000);
    this.sources = new Set(channels);
  }
  setSources(channels: readonly string[], now = Date.now()): void {
    const next = new Set(channels.filter((c) => this.channels.includes(c)));
    if ([...next].sort().join(',') === [...this.sources].sort().join(',')) return;
    this.tick(now);
    this.end();
    this.connected = false;
    this.sources = next;
  }
  status(connected: boolean, now = Date.now()): void {
    this.tick(now);
    this.connected = connected;
    if (!connected) this.end();
    else this.begin(Math.ceil(now / 1000));
  }
  private begin(second: number): void {
    for (const channel of this.sources)
      if (!this.active.has(channel)) this.active.set(channel, { channel, from: second, to: second });
  }
  private end(): void {
    this.spans.push(...[...this.active.values()].filter((s) => s.to > s.from));
    this.active.clear();
  }
  tick(now = Date.now()): void {
    const second = Math.floor(now / 1000);
    if (second < this.last) {
      this.end();
      this.connected = false;
      this.last = second;
      return;
    }
    if (second - this.last > 5) this.end();
    if (this.connected) {
      this.begin(second);
      for (const span of this.active.values()) span.to = second;
    }
    this.last = second;
    this.spans = this.spans.filter((s) => s.to > second - KEEP).slice(-MAX);
  }
  snapshot(now = Date.now()): ObservationSpan[] {
    this.tick(now);
    return [...this.spans, ...this.active.values()]
      .filter((s) => s.to > s.from)
      .slice(-MAX)
      .map((s) => ({ ...s, from: Math.max(s.from, Math.floor(now / 1000) - KEEP) }));
  }
  restore(value: unknown, now = Date.now()): void {
    if (!Array.isArray(value) || value.length > MAX) return;
    const restored: ObservationSpan[] = [];
    for (const s of value) {
      if (
        !object(s) ||
        typeof s.channel !== 'string' ||
        !this.channels.includes(s.channel) ||
        typeof s.from !== 'number' ||
        typeof s.to !== 'number' ||
        !Number.isSafeInteger(s.from) ||
        !Number.isSafeInteger(s.to) ||
        s.from < 0 ||
        s.to <= s.from ||
        s.to > Math.floor(now / 1000) + 1
      )
        return;
      const from = Math.max(s.from, Math.floor(now / 1000) - KEEP),
        to = Math.min(s.to, this.started);
      if (to > from) restored.push({ channel: s.channel, from, to });
    }
    this.spans = restored;
  }
}
