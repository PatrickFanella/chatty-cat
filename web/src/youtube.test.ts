// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { youtubeVideo, youtubeFrame } from './youtube';
it('recognizes playable original URL forms and bounded start offsets', () => {
  for (const raw of [
    'https://music.youtube.com/watch?v=abcdefghijk',
    'https://youtube.com/live/abcdefghijk',
    'https://www.youtube-nocookie.com/embed/abcdefghijk',
    'https://youtu.be/abcdefghijk',
  ])
    expect(youtubeVideo(raw)?.id).toBe('abcdefghijk');
  expect(youtubeVideo('https://youtu.be/abcdefghijk?t=1h2m3s')?.start).toBe(3723);
  expect(youtubeVideo('https://youtu.be/abcdefghijk?t=1m')?.start).toBe(60);
  expect(youtubeVideo('https://youtu.be/abcdefghijk?t=999999999')?.start).toBe(86400);
  for (const raw of [
    'https://youtube.com.evil.test/watch?v=abcdefghijk',
    'https://user@youtube.com/watch?v=abcdefghijk',
    'https://youtube.com/channel/abcdefghijk',
    'https://youtu.be/abcdefghijk/other',
  ])
    expect(youtubeVideo(raw)).toBeUndefined();
  const frame = youtubeFrame({ id: 'abcdefghijk', start: 90 }, 'Safe title');
  expect(frame.src).toBe('https://www.youtube-nocookie.com/embed/abcdefghijk?autoplay=0&start=90');
  expect(frame.allow).not.toContain('autoplay');
  expect(frame.title).toBe('Safe title');
});
