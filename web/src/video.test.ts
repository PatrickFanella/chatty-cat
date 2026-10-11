// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { parseVideo, twitchParent, VideoPanel } from './video';
let panel: VideoPanel | undefined;
const instances: MockPlayer[] = [];
class MockPlayer {
  static READY = 'ready'; static ONLINE = 'online'; static OFFLINE = 'offline'; static PLAYBACK_BLOCKED = 'blocked'; static PLAY = 'play'; static PAUSE = 'pause';
  paused = true; listeners = new Map<string, () => void>(); setVolume = vi.fn(); setMuted = vi.fn(); setChannel = vi.fn();
  constructor(_container: string, readonly options: Record<string, unknown>) { instances.push(this); }
  play(): void { this.paused = false; } pause(): void { this.paused = true; } isPaused(): boolean { return this.paused; }
  addEventListener(name: string, callback: () => void): void { this.listeners.set(name, callback); }
}
afterEach(() => { panel?.stop(); panel = undefined; instances.splice(0); vi.unstubAllGlobals(); localStorage.clear(); document.body.replaceChildren(); });
function setup() {
  vi.stubGlobal('Twitch', { Player: MockPlayer }); const root = document.createElement('section'); root.hidden = true;
  root.innerHTML = '<button id="video-handle"></button><button id="video-pin"></button><button id="video-dock"></button><button id="video-close"></button><select id="video-channel"></select><input id="video-volume" type="range" min="0" max="1" step=".05"><button id="video-mute"></button><button id="video-play"></button><a id="video-external"></a><div id="video-status"></div><div id="video-player"></div>';
  const trigger = document.createElement('button'); document.body.append(trigger, root); panel = new VideoPanel(root, trigger, ['one', 'two']); return { root, trigger };
}
it('validates saved volume/channel and derives a domain-only parent', () => {
  expect(parseVideo({ volume: 100, channel: 'unjoined', muted: false }, ['one'])).toEqual({ channel: 'one', volume: .5, muted: false, docked: false });
  expect(twitchParent('chat.subcult.tv')).toBe('chat.subcult.tv'); expect(() => twitchParent('https://example.com/path')).toThrow();
});
it('starts paused and controls only a ready player while retaining preferences', async () => {
  const { root, trigger } = setup(); trigger.click(); await Promise.resolve(); const player = instances[0]!;
  expect(player.options.autoplay).toBe(false); expect(player.options.parent).toEqual([location.hostname]);
  player.listeners.get('ready')?.(); root.querySelector<HTMLButtonElement>('#video-play')!.click(); expect(player.paused).toBe(false);
  root.querySelector<HTMLButtonElement>('#video-mute')!.click(); expect(player.setMuted).toHaveBeenLastCalledWith(false);
  const channel = root.querySelector<HTMLSelectElement>('#video-channel')!; channel.value = 'two'; channel.dispatchEvent(new Event('change')); expect(player.setChannel).toHaveBeenCalledWith('two');
  root.querySelector<HTMLButtonElement>('#video-close')!.click(); expect(player.paused).toBe(true); expect(root.hidden).toBe(true);
  expect(JSON.parse(localStorage.getItem('chatthing:v1:video') ?? '{}').channel).toBe('two');
});
it('uses the external link on narrow screens without loading a player', async () => {
  vi.stubGlobal('innerWidth', 375); const { root, trigger } = setup(); trigger.click(); await Promise.resolve();
  expect(instances).toHaveLength(0); expect(root.querySelector('#video-status')?.textContent).toContain('narrow'); expect(root.querySelector<HTMLAnchorElement>('#video-external')?.href).toBe('https://www.twitch.tv/one');
});
