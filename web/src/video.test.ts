// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { parseVideo, twitchParent, VideoPanel } from './video';
import { captureBundle, restoreBundle } from './settings-bundle';
import { defaultDisplay } from './display';
let panel: VideoPanel | undefined;
afterEach(() => { panel?.stop(); panel = undefined; vi.unstubAllGlobals(); localStorage.clear(); document.body.replaceChildren(); });
function setup() {
  // Detached markup exercises our frame contract without fetching Twitch.
  const root = document.createElement('section'); root.hidden = true;
  root.innerHTML = '<button id="video-handle"></button><button id="video-pin"></button><button id="video-dock"></button><button id="video-close"></button><select id="video-channel"></select><a id="video-external"></a><div id="video-status"></div><div id="video-player"></div>';
  const trigger = document.createElement('button'); document.body.append(trigger); panel = new VideoPanel(root, trigger, ['one', 'two']); return { root, trigger };
}
it('validates saved volume/channel and derives a domain-only parent', () => {
  expect(parseVideo({ volume: 100, channel: 'unjoined', muted: false }, ['one'])).toEqual({ channel: 'one', volume: .5, muted: false, docked: false });
  expect(twitchParent('chat.subcult.tv')).toBe('chat.subcult.tv'); expect(() => twitchParent('https://example.com/path')).toThrow();
});
it('uses the official iframe without requiring the failed SDK script', () => {
  const { root, trigger } = setup(); trigger.click(); const frame = root.querySelector('iframe')!;
  const url = new URL(frame.src);
  expect(url.origin).toBe('https://player.twitch.tv'); expect(url.searchParams.get('channel')).toBe('one'); expect(url.searchParams.get('parent')).toBe(location.hostname);
  expect(url.searchParams.get('autoplay')).toBe('false'); expect(url.searchParams.get('muted')).toBe('true'); expect(frame.allowFullscreen).toBe(true);
  expect(document.querySelector('script[src*="player.twitch.tv"]')).toBeNull(); expect(root.querySelector('#video-status')?.textContent).toContain('Twitch’s player controls');
  root.querySelector<HTMLButtonElement>('#video-close')!.click(); expect(root.querySelector('iframe')).toBeNull(); expect(root.hidden).toBe(true);
  trigger.click(); expect(root.querySelector('iframe')).not.toBeNull();
});
it('replaces the official frame on channel change and preserves preferences', () => {
  localStorage.setItem('chatthing:v1:video', JSON.stringify({ channel: 'one', volume: .7, muted: false, docked: false }));
  const { root, trigger } = setup(); trigger.click(); const previous = root.querySelector('iframe');
  const channel = root.querySelector<HTMLSelectElement>('#video-channel')!; channel.value = 'two'; channel.dispatchEvent(new Event('change'));
  expect(root.querySelector('iframe')).not.toBe(previous); expect(new URL(root.querySelector('iframe')!.src).searchParams.get('channel')).toBe('two');
  expect(new URL(root.querySelector('iframe')!.src).searchParams.get('muted')).toBe('false');
  expect(root.querySelector<HTMLAnchorElement>('#video-external')!.href).toBe('https://www.twitch.tv/two');
  expect(JSON.parse(localStorage.getItem('chatthing:v1:video') ?? '{}')).toMatchObject({ channel: 'two', volume: .7, muted: false });
});
it('stops hidden rail video and restores one frame when reopened', () => {
  const { root } = setup(); panel!.showRail(true); expect(root.querySelectorAll('iframe')).toHaveLength(1);
  panel!.showRail(true); expect(root.querySelectorAll('iframe')).toHaveLength(1);
  panel!.showRail(false); expect(root.querySelector('iframe')).toBeNull(); expect(root.hidden).toBe(true);
  panel!.showRail(true); expect(root.querySelectorAll('iframe')).toHaveLength(1);
  panel!.stop(); expect(root.querySelector('iframe')).toBeNull();
});
it('uses the external link on narrow screens without loading a player', () => {
  vi.stubGlobal('innerWidth', 375); const { root, trigger } = setup(); trigger.click();
  expect(root.querySelector('iframe')).toBeNull(); expect(root.querySelector('#video-status')?.textContent).toContain('narrow'); expect(root.querySelector<HTMLAnchorElement>('#video-external')?.href).toBe('https://www.twitch.tv/one');
});
it('restores video channel, visibility and docking from a settings slot without autoplay', () => {
  const { root, trigger } = setup(); trigger.click();
  const channel = root.querySelector<HTMLSelectElement>('#video-channel')!; channel.value = 'two'; channel.dispatchEvent(new Event('change'));
  root.querySelector<HTMLButtonElement>('#video-dock')!.click(); const bundle = captureBundle(defaultDisplay());
  root.querySelector<HTMLButtonElement>('#video-close')!.click(); channel.value = 'one'; channel.dispatchEvent(new Event('change'));
  restoreBundle(bundle); expect(root.hidden).toBe(false); expect(root.classList.contains('video-docked')).toBe(true);
  const frame = new URL(root.querySelector('iframe')!.src); expect(frame.searchParams.get('channel')).toBe('two'); expect(frame.searchParams.get('autoplay')).toBe('false');
});
