import { expect, it } from 'vitest';
import { formatStreamUptime, streamHeader } from './stream-header';
import { presentationDefaults } from './presentation';
it('controls category independently and tolerates older metadata', () => {
  const stream = { uptime: '2h', viewers: '12', title: 'Public title', game: 'Music' };
  expect(streamHeader(stream, presentationDefaults)).toBe('2:00:00 · 12 viewers · Music · Public title');
  expect(streamHeader(stream, { ...presentationDefaults, headerGame: false })).toBe(
    '2:00:00 · 12 viewers · Public title',
  );
  expect(
    streamHeader({ uptime: stream.uptime, viewers: stream.viewers, title: stream.title }, presentationDefaults),
  ).toBe('2:00:00 · 12 viewers · Public title');
  expect(
    streamHeader(
      { ...stream, viewers: 'unavailable' },
      { ...presentationDefaults, headerTitle: false, headerUptime: false },
    ),
  ).toBe('Music');
});

it.each([
  ['3 hours, 35 minutes, 44 seconds', '3:35:44'],
  ['3h35m44s', '3:35:44'],
  ['1 day, 2 hours, 5 seconds', '26:00:05'],
  ['9 minutes', '0:09:00'],
  ['offline', 'offline'],
  ['', ''],
])('formats uptime %s as %s', (input, expected) => {
  expect(formatStreamUptime(input)).toBe(expected);
});
