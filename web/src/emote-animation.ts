import type { Emote } from './tokens';

interface AnimationState {
  play: string;
  still: string;
  frozen: boolean;
  paused: boolean;
  failed: boolean;
}
const animations = new WeakMap<HTMLImageElement, AnimationState>();

function update(image: HTMLImageElement, state: AnimationState): void {
  const source = state.frozen || state.paused || state.failed ? state.still : state.play;
  if (image.getAttribute('src') !== source) image.src = source;
}

// Keep the first decoded aspect ratio across static/animated asset changes.
// CSS still owns the emote height, scale, overlays and maximum width.
export function configureEmoteAnimation(image: HTMLImageElement, emote: Emote, frozen: boolean): void {
  if (emote.animated) image.dataset.animatedEmote = '';
  if (!emote.animated || !emote.staticUrl || emote.staticUrl === emote.url) {
    image.src = frozen && emote.staticUrl ? emote.staticUrl : emote.url;
    return;
  }
  const state: AnimationState = {
    play: emote.url,
    still: emote.staticUrl,
    frozen,
    paused: document.hidden,
    failed: false,
  };
  animations.set(image, state);
  image.dataset.emoteAnimation = '';
  image.addEventListener('load', () => {
    if (!image.style.aspectRatio && image.naturalWidth && image.naturalHeight)
      image.style.aspectRatio = `${image.naturalWidth} / ${image.naturalHeight}`;
  });
  update(image, state);
}

export function pauseEmoteAnimations(root: HTMLElement, paused: boolean): void {
  for (const image of root.querySelectorAll<HTMLImageElement>('img[data-emote-animation]')) {
    const state = animations.get(image);
    if (!state) continue;
    state.paused = paused;
    update(image, state);
  }
}

export function freezeEmoteAnimation(image: HTMLImageElement, frozen: boolean): void {
  const state = animations.get(image);
  if (!state) return;
  state.frozen = frozen;
  update(image, state);
}

// Once an animated asset fails, visibility changes must not retry it forever.
export function fallbackEmoteAnimation(image: HTMLImageElement): boolean {
  const state = animations.get(image);
  if (!state || image.getAttribute('src') === state.still) return false;
  state.failed = true;
  update(image, state);
  return true;
}

export function emoteAnimationSnapshot(): object {
  let playing = 0,
    paused = 0,
    withoutStatic = 0;
  for (const image of document.querySelectorAll<HTMLImageElement>('img[data-animated-emote]')) {
    const state = animations.get(image);
    if (!state) withoutStatic++;
    else if (state.paused || state.frozen || state.failed) paused++;
    else playing++;
  }
  return { playing, paused, withoutStatic };
}
