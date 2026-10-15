// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { twitchMedia, twitchFrame } from './twitch-media';
it('recognizes exact clip/VOD routes, rejects lookalikes and preserves valid VOD time', () => {
  expect(twitchMedia('https://clips.twitch.tv/Clip-ID')).toEqual({ kind: 'clip', id: 'Clip-ID' });
  expect(twitchMedia('https://www.twitch.tv/one/clip/Clip-ID')).toEqual({ kind: 'clip', id: 'Clip-ID' });
  expect(twitchMedia('https://www.twitch.tv/videos/123?t=1h2m3s')).toEqual({
    kind: 'video',
    id: '123',
    time: '1h2m3s',
  });
  for (const url of [
    'https://twitch.tv.evil.org/videos/123',
    'https://twitch.tv/videos/invalid',
    'https://clips.twitch.tv/slug/extra',
    'https://user@twitch.tv/videos/123',
  ])
    expect(twitchMedia(url)).toBeUndefined();
});
it('uses native players with the correct parent, minimum height and no restored autoplay', () => {
  for (const media of [
    { kind: 'clip', id: 'Clip-ID' },
    { kind: 'video', id: '123', time: '2m' },
  ] as const) {
    const frame = twitchFrame(media, 'Title'),
      url = new URL(frame.src);
    expect(url.searchParams.get('parent')).toBe(location.hostname);
    expect(url.searchParams.get('autoplay')).toBe('false');
    expect(frame.height).toBe('300');
    expect(frame.allowFullscreen).toBe(true);
    if (media.kind === 'video') {
      expect(url.searchParams.get('video')).toBe('v123');
      expect(url.searchParams.get('time')).toBe('2m');
    } else expect(url.searchParams.get('clip')).toBe('Clip-ID');
  }
});
