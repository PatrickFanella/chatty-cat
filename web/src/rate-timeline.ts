import { clockTask, stopClockTask } from './shell/clock';
import { WorkerRateSeries } from './worker-rate-series';
import type { RateSample } from './rate-series';
export { RateSeries } from './rate-series';
export type { RateSnapshot, RateSample, GapCause, RateGap } from './rate-series';
export { isGlorp } from './glorp';
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
  readonly series: WorkerRateSeries;
  readonly ready: Promise<void>;
  private timer: ReturnType<typeof clockTask>;
  private storageTimer: ReturnType<typeof clockTask>;
  private saving: Promise<void> | undefined;
  private closing: Promise<void> | undefined;
  private stopped = false;
  private painting = false;
  constructor(
    private header: HTMLElement,
    channels: readonly string[],
  ) {
    this.series = new WorkerRateSeries(channels);
    this.ready = this.series.ready.then(() => this.paint());
    this.timer = clockTask(
      'rate.timeline',
      () => {
        this.series.tick();
        void this.paint();
      },
      1000,
      { active: () => !this.stopped, resume: true },
    );
    this.storageTimer = clockTask('storage.rates', () => this.save(), 30000, { pool: 'storage', flushOnHide: true });
  }
  private async paint(): Promise<void> {
    if (
      this.painting ||
      this.stopped ||
      document.hidden ||
      !this.header.isConnected ||
      (typeof this.header.checkVisibility === 'function' && !this.header.checkVisibility())
    )
      return;
    this.painting = true;
    try {
      const seconds = Math.max(240, Math.min(1800, Math.floor((this.header.clientWidth || 720) / 3)));
      const samples = await this.series.samples(Date.now(), seconds);
      if (this.stopped || document.hidden || !this.header.isConnected) return;
      const latest = samples.at(-1);
      this.header.replaceChildren(timelineGraph(samples));
      this.header.title = latest?.gap ?? `${latest?.rate.toFixed(1) ?? '0.0'} msgs/sec · last ${seconds}s`;
    } catch {
      if (!this.stopped) {
        this.header.replaceChildren();
        this.header.title = 'Rate worker unavailable; reload to resume rates.';
      }
    } finally {
      this.painting = false;
    }
  }
  private save(): Promise<void> {
    return (this.saving ??= this.series.save().finally(() => {
      this.saving = undefined;
    }));
  }
  stop(): Promise<void> {
    if (this.closing) return this.closing;
    this.stopped = true;
    stopClockTask(this.timer);
    stopClockTask(this.storageTimer);
    return (this.closing = this.series.stop());
  }
}
