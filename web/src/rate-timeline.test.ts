// @vitest-environment happy-dom
import '../test-support/storage-worker-shim';
import { expect, it, vi } from 'vitest';
import { RateSeries, RateTimeline, isGlorp, timelineGraph } from './rate-timeline';
import type { ChatMessage } from './protocol';
const message: ChatMessage = {
  id: 'id',
  channel: 'one',
  login: 'alice',
  command: 'PRIVMSG',
  text: 'glorp',
  timestamp: 100000,
  tags: {},
};
it('counts observed live messages once, isolates channels and computes rolling per-second rates', () => {
  const series = new RateSeries(['one', 'two'], 100000);
  series.status({ type: 'status', detail: '', state: 'connected' }, 100000);
  series.observe(message, false, 100000);
  series.observe(message, true, 100000);
  series.observe(message, true, 100000);
  series.observe({ ...message, id: 'other', channel: 'two', text: 'hello' }, true, 101000);
  const samples = series.samples(104000, 5);
  expect(samples.at(-1)).toMatchObject({ rate: 0.4, glorps: 0, gap: undefined });
  expect(series.samples(100000, 1, 'one')[0]).toMatchObject({ rate: 0.2, glorps: 1 });
});
it('records socket and timer gaps without treating replay as recovered live traffic', () => {
  const series = new RateSeries(['one'], 100000);
  series.status({ type: 'status', detail: '', state: 'connected' }, 100000);
  series.status({ type: 'status', detail: '', state: 'reconnecting' }, 102000);
  series.observe(message, false, 103000);
  series.status({ type: 'status', detail: '', state: 'connected' }, 105000);
  expect(series.samples(105000, 5)[2]?.gap).toBe('socket dropped');
  series.tick(120000);
  expect(series.samples(120000, 5)[0]?.gap).toBe('timer paused');
});
it('restores watched zeroes and marks closed time without duplicating current startup counts', () => {
  const old = new RateSeries(['one'], 100000);
  old.status({ type: 'status', detail: '', state: 'connected' }, 100000);
  old.observe(message, true, 101000);
  old.tick(104000);
  const saved = old.snapshot(104000),
    current = new RateSeries(['one'], 110000);
  current.observe({ ...message, id: 'new' }, true, 110000);
  current.restore(saved, 110000);
  current.status({ type: 'status', detail: '', state: 'connected' }, 110000);
  const samples = current.samples(110000, 11);
  expect(samples[0]?.gap).toBeUndefined();
  expect(samples[1]?.rate).toBe(0.2);
  expect(samples[6]?.gap).toBe('page closed');
  expect(samples.at(-1)?.rate).toBe(0.2);
});
it('rejects malformed counts and keeps unknown history distinct from observed silence', () => {
  const series = new RateSeries(['one'], 100000);
  series.restore(
    {
      at: 100,
      from: 'invalid',
      rows: [
        ['one', 99, -1, 0],
        ['one', 98, 1, 2],
        ['other', 97, 1, 0],
      ],
      gaps: [],
    },
    100000,
  );
  expect(series.snapshot(100000).rows).toEqual([]);
  const graph = timelineGraph(series.samples(100000, 5));
  expect(graph.getAttribute('aria-label')).toContain('unwatched');
  expect(graph.querySelector('title')?.textContent).toContain('not observed');
});
it('recognizes original glorp/F markers and the bot trigger', () => {
  expect(isGlorp({ ...message, text: 'florp' })).toBe(true);
  expect(isGlorp({ ...message, text: 'F' })).toBe(true);
  expect(isGlorp({ ...message, text: 'coffee' })).toBe(false);
  expect(isGlorp({ ...message, login: 'fossabot', text: 'trigger is pulled and bullet fired' })).toBe(true);
});
it('ranks distinct bursts across the full recorded day and isolates glorp spikes', () => {
  const series = new RateSeries(['one'], 100000);
  series.status({ type: 'status', detail: '', state: 'connected' }, 100000);
  for (const [second, count] of [
    [110, 30],
    [115, 30],
    [200, 25],
    [2200, 20],
  ] as const)
    for (let i = 0; i < count; i++)
      series.observe(
        { ...message, id: second + ':' + i, text: second === 200 ? 'glorp' : 'hello' },
        true,
        second * 1000,
      );
  const peaks = series.peaks(2400000, 'one');
  expect(peaks.map((p) => p.second)).toEqual([110, 200, 2200]);
  expect(series.peaks(2400000, 'one', 86400, 'glorps').map((p) => p.second)).toEqual([200]);
  expect(series.peaks(2400000, 'other')).toEqual([]);
});

it('shares unwatched history and live socket gaps in millisecond age windows', () => {
  const series = new RateSeries(['one'], 100000);
  series.status({ type: 'status', detail: '', state: 'connected' }, 100000);
  series.status({ type: 'status', detail: '', state: 'reconnecting' }, 102000);
  const gaps = series.observationGaps(110000);
  expect(gaps).toContainEqual({ from: 102000, to: 111000 });
  expect(gaps.some((gap) => gap.to === 100000)).toBe(true);
  series.status({ type: 'status', detail: '', state: 'connected' }, 112000);
  expect(series.observationGaps(113000)).toContainEqual({ from: 102000, to: 112000 });
});

it('shades confirmed quiet intervals but never unwatched socket or timer periods', () => {
  const series = new RateSeries(['one'], 100000);
  series.status({ type: 'status', detail: '', state: 'connected' }, 100000);
  series.observe(message, true, 100000);
  for (let second = 101; second <= 200; second++) series.tick(second * 1000);
  series.observe({ ...message, id: 'next' }, true, 200000);
  expect(series.samples(200000, 101)[50]?.quiet).toBe(true);
  expect(timelineGraph(series.samples(200000, 101)).textContent).toContain('quiet period');
  series.status({ type: 'status', detail: '', state: 'reconnecting' }, 201000);
  series.status({ type: 'status', detail: '', state: 'connected' }, 302000);
  series.tick(302000);
  series.observe({ ...message, id: 'after-drop' }, true, 302000);
  expect(series.samples(302000, 102).some((sample) => sample.quiet)).toBe(false);
  const restored = new RateSeries(['one'], 303000);
  restored.restore(series.snapshot(302000), 303000);
  expect(restored.samples(303000, 204).some((sample) => sample.quiet)).toBe(true);
});
it('persists source-specific coverage atomically with counts and leaves legacy counts with unknown comparison coverage', () => {
  const old = new RateSeries(['one', 'two'], 100000);
  old.coverage.setSources(['one'], 100000);
  old.status({ type: 'status', state: 'connected', detail: '' }, 100000);
  for (let second = 100; second <= 105; second++) old.tick(second * 1000);
  const snapshot = old.snapshot(105000),
    current = new RateSeries(['one', 'two'], 110000);
  current.restore(snapshot, 110000);
  expect(current.coverage.snapshot(110000)).toEqual([{ channel: 'one', from: 100, to: 105 }]);
  const legacy = new RateSeries(['one', 'two'], 110000);
  legacy.restore({ ...snapshot, coverage: undefined }, 110000);
  expect(legacy.coverage.snapshot(110000)).toEqual([]);
});

it('stops graph rebuilds while hidden or detached and refreshes once on return without losing observations', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(100000);
  let hidden = false;
  const visibility = vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  const header = document.createElement('span');
  document.body.append(header);
  const paint = vi.spyOn(header, 'replaceChildren');
  const timeline = new RateTimeline(header, ['one']);
  await timeline.ready;
  paint.mockClear();
  try {
    timeline.series.status({ type: 'status', state: 'connected', detail: '' });
    timeline.series.observe({ ...message, id: 'visible', timestamp: Date.now() }, true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(paint).toHaveBeenCalledOnce();
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    paint.mockClear();
    timeline.series.observe({ ...message, id: 'hidden', timestamp: Date.now() }, true);
    await vi.advanceTimersByTimeAsync(60000);
    expect(paint).not.toHaveBeenCalled();
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(paint).toHaveBeenCalledOnce();
    expect((await timeline.series.snapshot()).rows.length).toBeGreaterThan(0);
    header.remove();
    paint.mockClear();
    await vi.advanceTimersByTimeAsync(5000);
    expect(paint).not.toHaveBeenCalled();
  } finally {
    await timeline.stop();
    header.remove();
    visibility.mockRestore();
    vi.useRealTimers();
  }
});
