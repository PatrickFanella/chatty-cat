import type { Panel } from './shell/panels';
import { emoteAnimationSnapshot } from './emote-animation';
import { clockSnapshot } from './shell/clock';
import { showPanel } from './shell/open-panel';
import {
  intervalSnapshot,
  resetIntervalSamples,
  sampleIntervals,
  deadlineSnapshot,
  resourceWorkSnapshot,
} from './resource-timers';

interface LogMetrics {
  mountedRows: number;
  rowCache: number;
  retainedMessages: number;
}
export class ResourceReadout implements Panel {
  readonly id = 'resource-readout';
  readonly title = 'Resource readout';
  readonly group = 'help';
  readonly root = document.createElement('dialog');
  private output = document.createElement('pre');
  private observer: PerformanceObserver | undefined;
  private supported = false;
  private recording = false;
  private started = 0;
  private elapsed = 0;
  private longTasks = { count: 0, totalMs: 0, maxMs: 0 };
  private visibilityChanges = 0;
  constructor(private logMetrics: () => LogMetrics) {
    this.root.id = 'resource-readout';
    this.root.dataset.shellOwned = 'true';
    this.root.setAttribute('aria-label', 'Resource readout');
    this.root.innerHTML =
      '<h2>Resource readout</h2><p>Local diagnostics. Native repeating timers, shared tasks and tracked provider deadlines. Callback maxima and explicit chat-render/worker dispatch/reply boundaries measure synchronous work only. Other timeouts, socket work, promise continuations and worker execution are not attributed. Heap is browser-dependent; CPU/GPU require external tools. Refresh manually to avoid a diagnostic polling timer.</p><button type="button" data-refresh>Refresh snapshot</button> <button type="button" data-reset>Reset sample</button> <button type="button" data-close>Stop and close</button>';
    this.root.append(this.output);
    this.root.querySelector('[data-refresh]')!.addEventListener('click', this.refresh);
    this.root.querySelector('[data-reset]')!.addEventListener('click', this.reset);
    this.root.querySelector('[data-close]')!.addEventListener('click', () => this.root.close());
    window.addEventListener('keydown', this.key, true);
    this.root.addEventListener('close', this.pause);
    document.addEventListener('visibilitychange', this.visibility);
    document.body.append(this.root);
  }
  open(): void {
    if (!this.recording) {
      this.recording = true;
      this.started = performance.now();
      sampleIntervals(true);
      if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
        try {
          this.observer = new PerformanceObserver((list) => this.consume(list.getEntries()));
          this.observer.observe({ type: 'longtask' });
          this.supported = true;
        } catch {
          this.observer = undefined;
          this.supported = false;
        }
      }
    }
    if (!this.root.open) showPanel(this.root);
    this.refresh();
  }
  private consume(entries: readonly PerformanceEntry[]): void {
    for (const entry of entries) {
      this.longTasks.count++;
      this.longTasks.totalMs += entry.duration;
      this.longTasks.maxMs = Math.max(this.longTasks.maxMs, entry.duration);
    }
  }
  private visibility = (): void => {
    if (this.recording) this.visibilityChanges++;
  };
  // The docked picker's document capture handler also consumes Escape. An open
  // diagnostic modal takes priority without changing the picker's own handler.
  private key = (event: KeyboardEvent): void => {
    if (this.root.open && event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.root.close();
    }
  };
  private pause = (): void => {
    if (!this.recording) return;
    this.consume(this.observer?.takeRecords() ?? []);
    this.observer?.disconnect();
    this.observer = undefined;
    this.elapsed += performance.now() - this.started;
    this.recording = false;
    sampleIntervals(false);
  };
  private reset = (): void => {
    this.observer?.takeRecords();
    this.longTasks = { count: 0, totalMs: 0, maxMs: 0 };
    this.visibilityChanges = 0;
    this.elapsed = 0;
    this.started = performance.now();
    resetIntervalSamples();
    this.refresh();
  };
  snapshot(): object {
    const heap = (
      performance as Performance & {
        memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
      }
    ).memory;
    const timers = intervalSnapshot();
    return {
      sampledMs: this.elapsed + (this.recording ? performance.now() - this.started : 0),
      recording: this.recording,
      hidden: document.hidden,
      visibilityChanges: this.visibilityChanges,
      ...this.logMetrics(),
      repeatingTimers: timers.length,
      timers,
      scheduledTasks: clockSnapshot(),
      protocolDeadlines: deadlineSnapshot(),
      synchronousWork: resourceWorkSnapshot(),
      animatedEmotes: emoteAnimationSnapshot(),
      longTasks: this.supported ? { ...this.longTasks } : 'unavailable',
      heap: heap
        ? { usedBytes: heap.usedJSHeapSize, allocatedBytes: heap.totalJSHeapSize, limitBytes: heap.jsHeapSizeLimit }
        : 'unavailable',
      cpu: 'external measurement required',
      gpu: 'external measurement required',
    };
  }
  private refresh = (): void => {
    this.consume(this.observer?.takeRecords() ?? []);
    this.output.textContent = JSON.stringify(this.snapshot(), null, 2);
  };
  close(): void {
    this.root.close();
  }
  stop(): void {
    this.pause();
    document.removeEventListener('visibilitychange', this.visibility);
    window.removeEventListener('keydown', this.key, true);
    this.root.remove();
  }
}
