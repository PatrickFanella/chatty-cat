import { expect, it } from 'vitest';
import { buildComparison, comparisonExport, comparisonWindow, raidMark, titleMarks } from './comparison';
import { RateSeries } from './rate-timeline';
import type { ChatMessage } from './protocol';
const message: ChatMessage = {
  id: 'root',
  channel: 'one',
  command: 'PRIVMSG',
  login: 'private_sender',
  text: 'private text',
  timestamp: 100000,
  tags: { secret: 'secret' },
};
function fixture() {
  const rates = new RateSeries(['one', 'two'], 100000);
  rates.coverage.setSources(['one'], 100000);
  rates.status({ type: 'status', state: 'connected', detail: '' }, 100000);
  for (let sec = 100; sec <= 120; sec++) {
    rates.tick(sec * 1000);
    if (sec === 110) for (let i = 0; i < 30; i++) rates.observe({ ...message, id: String(i) }, true, sec * 1000);
  }
  const streams = {
    samples: () => [
      { at: 99000, live: true, viewers: 20, title: 'Old' },
      { at: 110000, live: true, viewers: 0, title: 'New <script>secret()</script>' },
      { at: 119000, live: true, viewers: null, title: 'New <script>secret()</script>' },
    ],
  };
  return { rates, streams };
}
it('compares matching units on aligned buckets while treating channel gaps and missing polls separately from zero', () => {
  const { rates, streams } = fixture(),
    result = buildComparison(['one', 'two'], 100000, 120000, rates, streams, [], 120000);
  expect(result.channels[0]?.rateSeconds).toBe(16);
  expect(result.channels[0]?.points.slice(0, 4).every((p) => p.rate === null)).toBe(true);
  expect(result.channels[0]?.points.find((p) => p.at === 110000)).toMatchObject({
    rate: 6,
    viewers: 0,
    viewerAt: 110000,
  });
  expect(result.channels[1]?.points.every((p) => p.rate === null)).toBe(true);
  expect(result.channels[0]?.points.find((p) => p.at === 111000)?.viewers).toBeNull();
  expect(result.marks.some((m) => m.kind === 'spike' && m.at === 110000)).toBe(true);
  expect(result.marks.some((m) => m.kind === 'title' && m.at === 110000)).toBe(true);
});
it('exports a whitelist of aggregate fields with escaped public annotations, no account, sender, tags or raw chat', () => {
  const { rates, streams } = fixture(),
    raid = raidMark(
      {
        ...message,
        id: 'raid',
        command: 'USERNOTICE',
        tags: { 'msg-id': 'raid', access_token: 'credential' },
        timestamp: 115000,
      },
      100000,
      120000,
    )!;
  const result = buildComparison(['one'], 100000, 120000, rates, streams, [raid, raid], 120000),
    html = comparisonExport(result);
  expect(result.marks.filter((m) => m.kind === 'raid')).toHaveLength(1);
  for (const secret of ['private_sender', 'private text', 'credential', 'access_token', 'USERNOTICE'])
    expect(html).not.toContain(secret);
  expect(html).not.toContain('<script>');
  expect(html).toContain('&lt;script&gt;');
  expect(html).toContain('Viewer poll UTC');
  expect(html).toContain('gap');
});
it('rejects invalid windows/channel counts, bounds charts and discloses mark limits', () => {
  const { rates, streams } = fixture();
  for (const [from, to] of [
    [0, 86400001],
    [120000, 100000],
    [100000, 121000],
  ])
    expect(() => comparisonWindow(from!, to!, 120000)).toThrow();
  expect(() => buildComparison([], 100000, 120000, rates, streams, [], 120000)).toThrow();
  const result = buildComparison(
    ['one'],
    100000,
    120000,
    rates,
    streams,
    Array.from({ length: 120 }, (_, i) => ({ channel: 'one', kind: 'raid', at: 100000 + i, label: String(i) })),
    120000,
  );
  expect(result.marks).toHaveLength(100);
  expect(result.limited).toBe(true);
  expect(result.channels[0]!.points.length).toBeLessThanOrEqual(240);
});
it('does not imply title change timing through polling gaps and refuses replay as live-rate coverage', () => {
  expect(
    titleMarks(
      'one',
      [
        { at: 0, title: 'Old', live: true, viewers: 1 },
        { at: 100000, title: 'New', live: true, viewers: null },
      ],
      90000,
      110000,
    )[0]?.label,
  ).toContain('after gap');
  const rates = new RateSeries(['one'], 100000);
  rates.observe(message, false, 100000);
  const result = buildComparison(['one'], 100000, 110000, rates, { samples: () => [] }, [], 110000);
  expect(result.channels[0]?.points.every((p) => p.rate === null && p.viewers === null)).toBe(true);
});
it('keeps a chosen 24-hour window valid after a delay and shows older unretained rates as gaps', () => {
  const now = 200000000,
    end = now - 2000,
    start = end - 86400000,
    rates = new RateSeries(['one'], now);
  expect(() => comparisonWindow(start, end, now)).not.toThrow();
  const result = buildComparison(['one'], start, end, rates, { samples: () => [] }, [], now);
  expect(result.channels[0]?.points).toHaveLength(240);
  expect(result.channels[0]?.points.every((p) => p.rate === null && p.viewers === null)).toBe(true);
});
