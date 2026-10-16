// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import {
  configureEmoteAnimation,
  emoteAnimationSnapshot,
  fallbackEmoteAnimation,
  freezeEmoteAnimation,
  pauseEmoteAnimations,
} from './emote-animation';
import type { Emote } from './tokens';
const emote: Emote = {
  code: 'Dance',
  source: '7TV',
  url: 'https://cdn.test/dance.webp',
  staticUrl: 'https://cdn.test/still.webp',
  animated: true,
  zeroWidth: false,
};
afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
function setup(frozen = false) {
  const root = document.createElement('article'),
    image = document.createElement('img');
  root.append(image);
  document.body.append(root);
  configureEmoteAnimation(image, emote, frozen);
  return { root, image };
}
it('combines automatic pause with manual freeze and never resumes a failed animated asset', () => {
  const { root, image } = setup();
  pauseEmoteAnimations(root, true);
  expect(image.src).toBe(emote.staticUrl);
  freezeEmoteAnimation(image, true);
  pauseEmoteAnimations(root, false);
  expect(image.src).toBe(emote.staticUrl);
  freezeEmoteAnimation(image, false);
  expect(image.src).toBe(emote.url);
  expect(fallbackEmoteAnimation(image)).toBe(true);
  pauseEmoteAnimations(root, true);
  pauseEmoteAnimations(root, false);
  expect(image.src).toBe(emote.staticUrl);
  expect(fallbackEmoteAnimation(image)).toBe(false);
});
it('starts hidden images still and reports unsupported static variants separately', () => {
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  const { image, root } = setup();
  expect(image.src).toBe(emote.staticUrl);
  const unsupported = document.createElement('img');
  root.append(unsupported);
  configureEmoteAnimation(unsupported, { ...emote, staticUrl: '' }, false);
  expect(emoteAnimationSnapshot()).toEqual({ playing: 0, paused: 1, withoutStatic: 1 });
});
it('retains the first decoded ratio and avoids repeated source writes', () => {
  const { image, root } = setup();
  Object.defineProperties(image, {
    naturalWidth: { configurable: true, value: 112 },
    naturalHeight: { configurable: true, value: 56 },
  });
  image.dispatchEvent(new Event('load'));
  expect(image.style.aspectRatio).toBe('112 / 56');
  pauseEmoteAnimations(root, true);
  Object.defineProperty(image, 'naturalWidth', { value: 56 });
  image.dispatchEvent(new Event('load'));
  expect(image.style.aspectRatio).toBe('112 / 56');
  const setter = vi.spyOn(image, 'src', 'set');
  pauseEmoteAnimations(root, true);
  expect(setter).not.toHaveBeenCalled();
});
