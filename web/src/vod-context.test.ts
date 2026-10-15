import { expect, it } from 'vitest';
import { parseVodRange, vodOffset, vodFrameURL, vodTime } from './vod-context';
const range = {
  start: '2026-10-10T12:00:00Z',
  end: '2026-10-10T14:00:00Z',
  url: 'https://www.twitch.tv/videos/123',
  title: 'Stream',
};
it('converts absolute message time with a half-open archive range, independent of local time zones', () => {
  const message = { channel: 'one', timestamp: Date.parse('2026-10-10T08:01:02.999-04:00') };
  expect(vodOffset(range, message)).toBe(62);
  expect(vodOffset(range, { ...message, timestamp: Date.parse(range.start) })).toBe(0);
  expect(vodOffset(range, { ...message, timestamp: Date.parse(range.end) })).toBeUndefined();
  expect(vodOffset(range, { ...message, timestamp: Date.parse(range.start) - 1 })).toBeUndefined();
  const url = new URL(vodFrameURL(range, message, 'chat.subcult.tv'));
  expect(Object.fromEntries(url.searchParams)).toEqual({
    video: 'v123',
    parent: 'chat.subcult.tv',
    time: '0h1m2s',
    autoplay: 'false',
    muted: 'true',
  });
});
it('rejects malformed, unzoned, unsafe and oversized ranges or parents without inventing an offset', () => {
  for (const input of [
    null,
    { ...range, start: '2026-10-10T12:00:00' },
    { ...range, end: range.start },
    { ...range, end: '2026-10-18T14:00:00Z' },
    { ...range, url: 'https://twitch.tv.evil/videos/123' },
    { ...range, title: 'x'.repeat(301) },
  ])
    expect(parseVodRange(input)).toBeUndefined();
  for (const host of ['evil/parent', '-invalid.test', 'foo..test', 'a'.repeat(64) + '.test', 'https://example.org'])
    expect(() => vodFrameURL(range, { channel: 'one', timestamp: Date.parse(range.start) }, host)).toThrow('parent');
  expect(vodTime(3723)).toBe('1h2m3s');
  expect(() => vodTime(-1)).toThrow();
});
