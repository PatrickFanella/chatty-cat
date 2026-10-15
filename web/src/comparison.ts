import type { ChatMessage } from './protocol';
import type { RateSeries } from './rate-timeline';
import type { StreamHistory, StreamSample } from './stream-history';
import type { ObservationSpan } from './observation-coverage';
export interface ComparisonMark {
  channel: string;
  at: number;
  kind: 'title' | 'raid' | 'spike';
  label: string;
  message?: ChatMessage;
}
export interface ComparisonPoint {
  at: number;
  until: number;
  rate: number | null;
  rateSeconds: number;
  seconds: number;
  viewers: number | null;
  viewerAt: number | null;
  viewerSamples: number;
}
export interface ChannelComparison {
  channel: string;
  points: ComparisonPoint[];
  rateSeconds: number;
  viewerSamples: number;
  firstViewer: number | null;
  lastViewer: number | null;
}
export interface Comparison {
  from: number;
  to: number;
  channels: ChannelComparison[];
  marks: ComparisonMark[];
  limited: boolean;
}
export function comparisonWindow(from: number, to: number, now = Date.now()): void {
  if (
    !Number.isSafeInteger(from) ||
    !Number.isSafeInteger(to) ||
    from < 0 ||
    to <= from ||
    to > now ||
    to - from > 86400000
  )
    throw new Error('Choose a window of up to 24 hours, ending no later than now');
}
function mergedCoverage(spans: readonly ObservationSpan[], channel: string): { from: number; to: number }[] {
  const sorted = spans
      .filter((s) => s.channel === channel)
      .map((s) => ({ from: s.from, to: s.to }))
      .sort((a, b) => a.from - b.from),
    result: { from: number; to: number }[] = [];
  for (const span of sorted) {
    const previous = result.at(-1);
    if (previous && span.from <= previous.to) previous.to = Math.max(previous.to, span.to);
    else result.push({ ...span });
  }
  return result;
}
export function titleMarks(
  channel: string,
  samples: readonly StreamSample[],
  from: number,
  to: number,
): ComparisonMark[] {
  const result: ComparisonMark[] = [];
  let previous: StreamSample | undefined;
  for (const sample of samples) {
    if (sample.at >= to) break;
    if (sample.at >= from && sample.title && previous?.title && sample.title !== previous.title)
      result.push({
        channel,
        at: sample.at,
        kind: 'title',
        label:
          (sample.at - previous.at > 90000 ? 'Title first seen after gap: ' : 'Observed title change: ') +
          sample.title.slice(0, 200),
      });
    previous = sample;
  }
  return result;
}
export function raidMark(message: ChatMessage, from: number, to: number): ComparisonMark | undefined {
  if (
    message.command !== 'USERNOTICE' ||
    message.tags['msg-id'] !== 'raid' ||
    message.timestamp < from ||
    message.timestamp >= to
  )
    return;
  return {
    channel: message.channel,
    at: message.timestamp,
    kind: 'raid',
    label: 'Retained raid notice (provider timestamp)',
    message,
  };
}
export function buildComparison(
  channels: readonly string[],
  from: number,
  to: number,
  rates: Pick<RateSeries, 'samples' | 'coverage'>,
  streams: Pick<StreamHistory, 'samples'>,
  raids: readonly ComparisonMark[],
  now = Date.now(),
): Comparison {
  comparisonWindow(from, to, now);
  const names = [...new Set(channels)];
  if (!names.length || names.length > 6 || names.some((c) => !/^[a-z0-9_]{1,25}$/.test(c)))
    throw new Error('Select one to six joined channels');
  const first = Math.ceil(from / 1000),
    last = Math.floor(to / 1000),
    seconds = last - first;
  if (seconds < 1) throw new Error('Choose a window containing at least one complete second');
  const step = Math.max(1, Math.ceil(seconds / 240)),
    spans = rates.coverage.snapshot(now),
    marks: ComparisonMark[] = [];
  const comparisons = names.map((channel) => {
    const coverage = mergedCoverage(spans, channel),
      samples = rates.samples((last - 1) * 1000, Math.max(1, seconds), channel),
      viewerSamples = streams
        .samples(channel, from - 90000)
        .filter((s) => s.at < to)
        .sort((a, b) => a.at - b.at),
      points: ComparisonPoint[] = [];
    let spanIndex = 0;
    const valid = samples.map((sample) => {
      while (spanIndex < coverage.length && coverage[spanIndex]!.to <= sample.second) spanIndex++;
      const span = coverage[spanIndex];
      return !sample.gap && !!span && span.from <= sample.second - 4 && span.to > sample.second;
    });
    const peaks = samples
        .filter((s, i) => valid[i] && s.rate >= 4)
        .sort((a, b) => b.rate - a.rate || a.second - b.second),
      chosen: number[] = [];
    for (const peak of peaks) {
      if (chosen.every((at) => Math.abs(at - peak.second) > 10)) {
        chosen.push(peak.second);
        marks.push({
          channel,
          at: peak.second * 1000,
          kind: 'spike',
          label: 'Observed receipt-time spike: ' + peak.rate.toFixed(1) + ' messages/s (5-second mean)',
        });
      }
      if (chosen.length === 3) break;
    }
    for (let index = 0; index < seconds; index += step) {
      const chunk = samples.slice(index, Math.min(seconds, index + step)),
        count = chunk.filter((_, offset) => valid[index + offset]).length,
        at = (first + index) * 1000,
        until = Math.min(last, first + index + step) * 1000;
      const viewers = viewerSamples.filter((s) => s.at >= at && s.at < until && s.viewers !== null),
        viewer = viewers.at(-1);
      points.push({
        at,
        until,
        rate: count === chunk.length && count > 0 ? chunk.reduce((total, s) => total + s.rate, 0) / count : null,
        rateSeconds: count,
        seconds: chunk.length,
        viewers: viewer?.viewers ?? null,
        viewerAt: viewer?.at ?? null,
        viewerSamples: viewers.length,
      });
    }
    marks.push(...titleMarks(channel, viewerSamples, from, to));
    const retained = viewerSamples.filter((s) => s.at >= from && s.viewers !== null);
    return {
      channel,
      points,
      rateSeconds: valid.filter(Boolean).length,
      viewerSamples: retained.filter((s) => s.viewers !== null).length,
      firstViewer: retained[0]?.at ?? null,
      lastViewer: retained.at(-1)?.at ?? null,
    };
  });
  marks.push(...raids.filter((m) => names.includes(m.channel) && m.at >= from && m.at < to));
  const unique = [
    ...new Map(marks.map((m) => [JSON.stringify([m.channel, m.kind, m.message?.id || m.at, m.label]), m])).values(),
  ].sort((a, b) => a.at - b.at || a.channel.localeCompare(b.channel));
  return { from, to, channels: comparisons, marks: unique.slice(-100), limited: unique.length > 100 };
}
function escape(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}
export function comparisonExport(comparison: Comparison): string {
  const rows = comparison.channels
    .flatMap((c) =>
      c.points.map(
        (p) =>
          `<tr><td>${escape(c.channel)}</td><td>${new Date(p.at).toISOString()}</td><td>${p.rate === null ? 'gap' : p.rate.toFixed(2)}</td><td>${p.rateSeconds}/${p.seconds}</td><td>${p.viewers === null ? 'missing' : p.viewers}</td><td>${p.viewerSamples}</td><td>${p.viewerAt === null ? 'missing' : new Date(p.viewerAt).toISOString()}</td></tr>`,
      ),
    )
    .join('');
  const marks = comparison.marks
    .map((m) => `<li>${new Date(m.at).toISOString()} #${escape(m.channel)} ${escape(m.label)}</li>`)
    .join('');
  return (
    '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Observed stream comparison</title><style>body{font:16px system-ui;max-width:1000px;margin:auto;padding:24px}table{border-collapse:collapse;width:100%}td,th{padding:6px;border-bottom:1px solid #bbb;text-align:left}</style><h1>Observed stream comparison</h1><p>' +
    new Date(comparison.from).toISOString() +
    ' → ' +
    new Date(comparison.to).toISOString() +
    '</p><p>Device-local observations; gaps are not zero. Rates are 5-second rolling receipt-time means, averaged only across fully observed buckets; the first four seconds after each coverage gap remain unknown. Viewer values are the latest actual poll in each bucket, with no interpolation. Titles use poll timestamps; raids use provider message timestamps. Chat/video links and raw messages, sender fields, notes, account IDs and tokens are excluded. Up to 240 buckets/channel and 100 marks.</p>' +
    (comparison.limited ? '<p>Event list truncated to its last 100 marks.</p>' : '') +
    '<table><tr><th>Channel</th><th>Bucket UTC</th><th>Messages/s</th><th>Observed rate seconds</th><th>Viewers</th><th>Viewer polls</th><th>Viewer poll UTC</th></tr>' +
    rows +
    '</table><ul>' +
    marks +
    '</ul></html>'
  );
}
