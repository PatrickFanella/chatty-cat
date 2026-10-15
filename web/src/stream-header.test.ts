import { expect, it } from 'vitest';
import { streamHeader } from './stream-header';
import { presentationDefaults } from './presentation';
it('controls category independently and tolerates older metadata', () => {
  const stream = { uptime: '2h', viewers: '12', title: 'Public title', game: 'Music' };
  expect(streamHeader(stream, presentationDefaults)).toBe('2h · 12 viewers · Music · Public title');
  expect(streamHeader(stream, { ...presentationDefaults, headerGame: false })).toBe('2h · 12 viewers · Public title');
  expect(
    streamHeader({ uptime: stream.uptime, viewers: stream.viewers, title: stream.title }, presentationDefaults),
  ).toBe('2h · 12 viewers · Public title');
  expect(
    streamHeader(
      { ...stream, viewers: 'unavailable' },
      { ...presentationDefaults, headerTitle: false, headerUptime: false },
    ),
  ).toBe('Music');
});
