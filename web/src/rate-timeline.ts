import { isGlorp } from './glorp';
export { isGlorp } from './glorp';
import { StorageWorkerClient } from './storage-worker-client';
import { clockTask, stopClockTask } from './shell/clock';
import { ObservationCoverage, type ObservationSpan } from './observation-coverage';
import type { ChatMessage, ServerEvent } from './protocol';
export type GapCause = 'not observed' | 'connecting' | 'socket dropped' | 'page closed' | 'timer paused';
export interface RateGap {
  from: number;
  to: number;
  cause: GapCause;
}
export interface RateSample {
  second: number;
  rate: number;
  glorps: number;
  gap: GapCause | undefined;
  quiet?: boolean;
}
interface Count {
  messages: number;
  glorps: number;
}
export interface RateSnapshot {
  at: number;
  from: number;
  rows: [string, number, number, number][];
  gaps: RateGap[];
  coverage?: ObservationSpan[];
}
const KEEP = 86400;
export class RateSeries {
  readonly coverage: ObservationCoverage;
  private rows = new Map<string, Map<number, Count>>();
  private seen = new Set<string>();
  private gaps: RateGap[] = [];
  private active: { from: number; cause: GapCause } | undefined;
  private lastTick: number;
  private watchFrom: number;
  readonly started: number;
  constructor(
    private channels: readonly string[],
    now = Date.now(),
  ) {
    this.coverage = new ObservationCoverage(channels, now);
    this.started = Math.floor(now / 1000);
    this.lastTick = this.started;
    this.watchFrom = this.started;
    this.active = { from: this.started, cause: 'connecting' };
  }
  observe(message: ChatMessage, live: boolean, now = Date.now()): void {
    if (!live || message.command !== 'PRIVMSG' || !this.channels.includes(message.channel)) return;
    const key = message.channel + ':' + message.id;
    if (message.id && this.seen.has(key)) return;
    if (message.id) this.seen.add(key);
    while (this.seen.size > 20000) {
      const first = this.seen.values().next().value;
      if (first) this.seen.delete(first);
      else break;
    }
    const second = Math.floor(now / 1000),
      rows = this.rows.get(message.channel) ?? new Map<number, Count>(),
      count = rows.get(second) ?? { messages: 0, glorps: 0 };
    count.messages = Math.min(10000, count.messages + 1);
    if (isGlorp(message)) count.glorps = Math.min(10000, count.glorps + 1);
    rows.set(second, count);
    this.rows.set(message.channel, rows);
  }
  status(event: Extract<ServerEvent, { type: 'status' }>, now = Date.now()): void {
    this.coverage.status(event.state === 'connected', now);
    const second = Math.floor(now / 1000);
    if (event.state === 'connected') {
      if (this.active) {
        this.addGap(this.active.from, second, this.active.cause);
        this.active = undefined;
      }
    } else if (!this.active) this.active = { from: second, cause: 'socket dropped' };
  }
  tick(now = Date.now()): void {
    this.coverage.tick(now);
    const second = Math.floor(now / 1000);
    if (second - this.lastTick > 5 && !this.active) this.addGap(this.lastTick + 1, second, 'timer paused');
    this.lastTick = second;
    for (const rows of this.rows.values())
      for (const stamp of rows.keys()) if (stamp < second - KEEP) rows.delete(stamp);
    this.gaps = this.gaps.filter((gap) => gap.to >= second - KEEP).slice(-1000);
  }
  private addGap(from: number, to: number, cause: GapCause): void {
    if (to <= from) return;
    this.gaps.push({ from, to, cause });
    if (this.gaps.length > 1000) this.gaps.shift();
  }
  observationGaps(now = Date.now()): { from: number; to: number }[] {
    const end = Math.floor(now / 1000);
    return [
      ...this.gaps,
      ...(this.active ? [{ ...this.active, to: end + 1 }] : []),
      ...(this.watchFrom > end - KEEP ? [{ from: end - KEEP, to: this.watchFrom }] : []),
    ].map((gap) => ({ from: gap.from * 1000, to: gap.to * 1000 }));
  }
  samples(now = Date.now(), seconds = 240, channel = ''): RateSample[] {
    const end = Math.floor(now / 1000),
      size = Math.max(1, Math.min(KEEP, Math.floor(seconds)));
    const gaps = (this.active ? [...this.gaps, { ...this.active, to: end + 1 }] : [...this.gaps]).sort(
      (a, b) => a.from - b.from,
    );
    let gapIndex = 0;
    const counts = new Map<number, Count>();
    for (const [name, rows] of this.rows) {
      if (channel && channel !== name) continue;
      for (const [stamp, count] of rows)
        if (stamp >= end - size - 4 && stamp <= end) {
          const old = counts.get(stamp) ?? { messages: 0, glorps: 0 };
          counts.set(stamp, { messages: old.messages + count.messages, glorps: old.glorps + count.glorps });
        }
    }
    const quiet: { from: number; to: number }[] = [],
      stamps = [
        ...new Set(
          [...this.rows]
            .filter(([name]) => !channel || channel === name)
            .flatMap(([, rows]) => [...rows.keys()].filter((stamp) => stamp <= end)),
        ),
      ].sort((a, b) => a - b);
    for (let i = 1; i < stamps.length; i++) {
      const from = stamps[i - 1]!,
        to = stamps[i]!;
      if (
        to - from > 90 &&
        from >= this.watchFrom &&
        to <= this.lastTick + 5 &&
        !gaps.some((gap) => gap.from < to && gap.to > from)
      )
        quiet.push({ from, to });
    }
    let quietIndex = 0;
    return Array.from({ length: size }, (_, i) => {
      const second = end - size + 1 + i;
      let messages = 0;
      for (let offset = 0; offset < 5; offset++) messages += counts.get(second - offset)?.messages ?? 0;
      while (gapIndex < gaps.length && gaps[gapIndex]!.to <= second) gapIndex++;
      const current = gaps[gapIndex];
      const gap = current && second >= current.from && second < current.to ? current.cause : undefined;
      while (quietIndex < quiet.length && quiet[quietIndex]!.to <= second) quietIndex++;
      const silent = quiet[quietIndex];
      return {
        second,
        rate: messages / 5,
        glorps: counts.get(second)?.glorps ?? 0,
        gap: second < this.watchFrom ? (gap ?? 'not observed') : gap,
        quiet: !!silent && second > silent.from && second < silent.to,
      };
    });
  }
  peaks(now = Date.now(), channel = '', seconds = KEEP, kind: 'rate' | 'glorps' = 'rate'): RateSample[] {
    const candidates = this.samples(now, seconds, channel)
      .filter((sample) => !sample.gap && (kind === 'rate' ? sample.rate >= 4 : sample.glorps > 2))
      .sort((a, b) =>
        kind === 'rate' ? b.rate - a.rate || a.second - b.second : b.glorps - a.glorps || a.second - b.second,
      );
    if (kind === 'glorps') return candidates.slice(0, 3);
    const picks: RateSample[] = [];
    for (const candidate of candidates) {
      if (
        picks.every(
          (pick) =>
            Math.abs(pick.second - candidate.second) > 10 &&
            !(kind === 'rate' && Math.abs(pick.second - candidate.second) <= 30 && candidate.rate >= pick.rate - 0.05),
        )
      )
        picks.push(candidate);
      if (picks.length === 3) break;
    }
    return picks;
  }
  snapshot(now = Date.now()): RateSnapshot {
    this.tick(now);
    const rows: RateSnapshot['rows'] = [];
    for (const [channel, counts] of this.rows)
      for (const [second, count] of counts) rows.push([channel, second, count.messages, count.glorps]);
    return {
      at: Math.floor(now / 1000),
      from: Math.max(Math.floor(now / 1000) - KEEP, this.watchFrom),
      rows,
      coverage: this.coverage.snapshot(now),
      gaps: [
        ...this.gaps.map((gap) => ({ ...gap })),
        ...(this.active && Math.floor(now / 1000) > this.active.from
          ? [{ ...this.active, to: Math.floor(now / 1000) }]
          : []),
      ],
    };
  }
  restore(value: unknown, now = Date.now()): void {
    if (!value || typeof value !== 'object') return;
    const data = value as Record<string, unknown>,
      end = Math.floor(now / 1000);
    if (
      typeof data.at !== 'number' ||
      !Number.isSafeInteger(data.at) ||
      data.at > end + 5 ||
      data.at < end - KEEP ||
      !Array.isArray(data.rows) ||
      !Array.isArray(data.gaps)
    )
      return;
    if (
      typeof data.from === 'number' &&
      Number.isSafeInteger(data.from) &&
      data.from >= end - KEEP &&
      data.from <= this.started
    )
      this.watchFrom = data.from;
    for (const entry of data.rows.slice(-KEEP * 6)) {
      if (
        !Array.isArray(entry) ||
        entry.length !== 4 ||
        typeof entry[0] !== 'string' ||
        !this.channels.includes(entry[0]) ||
        !entry.slice(1).every((v) => typeof v === 'number' && Number.isSafeInteger(v)) ||
        entry[1] < end - KEEP ||
        entry[1] >= this.started ||
        entry[2] < 0 ||
        entry[2] > 10000 ||
        entry[3] < 0 ||
        entry[3] > entry[2]
      )
        continue;
      const rows = this.rows.get(entry[0]) ?? new Map<number, Count>();
      rows.set(entry[1], { messages: entry[2], glorps: entry[3] });
      this.rows.set(entry[0], rows);
    }
    const causes: GapCause[] = ['not observed', 'connecting', 'socket dropped', 'page closed', 'timer paused'];
    for (const raw of data.gaps.slice(-1000)) {
      if (!raw || typeof raw !== 'object') continue;
      const gap = raw as Record<string, unknown>;
      if (
        typeof gap.from === 'number' &&
        typeof gap.to === 'number' &&
        Number.isSafeInteger(gap.from) &&
        Number.isSafeInteger(gap.to) &&
        gap.from >= end - KEEP &&
        gap.to <= this.started &&
        gap.to > gap.from &&
        causes.includes(gap.cause as GapCause)
      )
        this.addGap(gap.from, gap.to, gap.cause as GapCause);
    }
    if (this.started - data.at > 2) this.addGap(data.at + 1, this.started, 'page closed');
    if (
      data.rows.length <= KEEP * 6 &&
      data.rows.every(
        (entry) =>
          Array.isArray(entry) &&
          entry.length === 4 &&
          typeof entry[0] === 'string' &&
          this.channels.includes(entry[0]) &&
          entry.slice(1).every((v) => typeof v === 'number' && Number.isSafeInteger(v)) &&
          entry[2] >= 0 &&
          entry[2] <= 10000 &&
          entry[3] >= 0 &&
          entry[3] <= entry[2],
      )
    )
      this.coverage.restore(data.coverage, now);
  }
}
export function timelineGraph(samples: readonly RateSample[]): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg',
    svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 600 40');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Observed messages per second; coloured bands mark unwatched periods');
  const peak = Math.max(1, ...samples.map((sample) => sample.rate));
  for (const [index, sample] of samples.entries()) {
    const rect = document.createElementNS(ns, 'rect'),
      width = 600 / Math.max(1, samples.length),
      band = sample.gap || sample.quiet;
    rect.setAttribute('x', String(index * width));
    rect.setAttribute('width', String(width));
    rect.setAttribute('y', band ? '0' : String(40 - (sample.rate / peak) * 36));
    rect.setAttribute('height', band ? '40' : String((sample.rate / peak) * 36));
    rect.setAttribute(
      'fill',
      sample.gap
        ? sample.gap === 'page closed'
          ? '#a48ad4'
          : sample.gap === 'timer paused' || sample.gap === 'not observed'
            ? '#898994'
            : '#d96a72'
        : sample.quiet
          ? '#898994'
          : sample.glorps
            ? '#ed7777'
            : 'currentColor',
    );
    rect.setAttribute('opacity', band ? '.35' : '1');
    const title = document.createElementNS(ns, 'title');
    title.textContent =
      new Date(sample.second * 1000).toLocaleTimeString() +
      ' · ' +
      (sample.gap ||
        (sample.quiet ? 'quiet period · ' : '') + sample.rate.toFixed(1) + ' msgs/s · ' + sample.glorps + ' glorp/F');
    rect.append(title);
    svg.append(rect);
    if (sample.second % 10 === 0) {
      const tick = document.createElementNS(ns, 'line');
      tick.setAttribute('x1', String(index * width));
      tick.setAttribute('x2', String(index * width));
      tick.setAttribute('y1', sample.second % 60 === 0 ? '30' : '35');
      tick.setAttribute('y2', '40');
      tick.setAttribute('stroke', 'currentColor');
      tick.setAttribute('opacity', '.35');
      svg.append(tick);
    }
  }
  return svg;
}
export class RateTimeline {
  readonly series: RateSeries;
  readonly ready: Promise<void>;
  private timer: ReturnType<typeof clockTask>;
  private storageTimer: ReturnType<typeof clockTask>;
  private saving: Promise<void> | undefined;
  private closing: Promise<void> | undefined;
  private storage = new StorageWorkerClient(
    undefined,
    30000,
    'Rate storage worker unavailable; live rates continue without persistence.',
  );
  private stopped = false;
  constructor(
    private header: HTMLElement,
    channels: readonly string[],
  ) {
    this.series = new RateSeries(channels);
    this.ready = this.storage
      .request('rates.read', channels.join(','))
      .then((snapshot) => {
        // Restore retained history even when stop is waiting to save its final snapshot.
        this.series.restore(snapshot);
        if (!this.stopped) this.paint();
      })
      .catch(() => {});
    this.timer = clockTask(
      'rate.timeline',
      () => {
        this.series.tick();
        this.paint();
      },
      1000,
      { active: () => !this.stopped, resume: true },
    );
    this.storageTimer = clockTask(
      'storage.rates',
      () => {
        void this.save(this.key);
      },
      30000,
      { pool: 'storage', flushOnHide: true },
    );
    this.key = channels.join(',');
    this.paint();
  }
  private key: string;
  private paint(): void {
    if (
      document.hidden ||
      !this.header.isConnected ||
      (typeof this.header.checkVisibility === 'function' && !this.header.checkVisibility())
    )
      return;
    const seconds = Math.max(240, Math.min(1800, Math.floor((this.header.clientWidth || 720) / 3)));
    const samples = this.series.samples(Date.now(), seconds),
      latest = samples.at(-1);
    this.header.replaceChildren(timelineGraph(samples));
    this.header.title = latest?.gap ?? `${latest?.rate.toFixed(1) ?? '0.0'} msgs/sec · last ${seconds}s`;
  }
  private save(key: string): Promise<void> {
    if (this.saving) return this.saving;
    this.saving = this.persist(key).finally(() => {
      this.saving = undefined;
    });
    return this.saving;
  }
  private async persist(key: string): Promise<void> {
    try {
      await this.ready;
      await this.storage.request('rates.write', key, this.series.snapshot());
    } catch {
      /* Optional public aggregate storage; live rate observations continue. */
    }
  }
  stop(): Promise<void> {
    if (this.closing) return this.closing;
    this.stopped = true;
    stopClockTask(this.timer);
    stopClockTask(this.storageTimer);
    // Drain an older save, then capture any observations received while it was pending.
    this.closing = (this.saving ?? Promise.resolve())
      .then(() => this.save(this.key))
      .finally(() => this.storage.stop())
      .catch(() => {});
    return this.closing;
  }
}
