import { FloatingPanel } from './floating';
interface Player { play(): void; pause(): void; setVolume(volume: number): void; setMuted(muted: boolean): void; setChannel(channel: string): void; isPaused(): boolean; addEventListener(event: string, callback: () => void): void; }
interface TwitchSDK { Player: { new (element: string, options: { width: string; height: string; channel: string; parent: string[]; autoplay: boolean; muted: boolean }): Player; READY: string; ONLINE: string; OFFLINE: string; PLAYBACK_BLOCKED: string; PLAY: string; PAUSE: string; } }
let sdkPromise: Promise<TwitchSDK> | undefined;
function sdk(): Promise<TwitchSDK> {
  const host = window as Window & { Twitch?: TwitchSDK }; if (host.Twitch) return Promise.resolve(host.Twitch);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = 'https://player.twitch.tv/js/embed/v1.js'; script.async = true;
    const fail = (): void => { clearTimeout(timer); script.remove(); sdkPromise = undefined; reject(new Error('Twitch player unavailable')); };
    const timer = setTimeout(fail, 15000); script.onerror = fail; script.onload = () => { clearTimeout(timer); if (host.Twitch) resolve(host.Twitch); else fail(); }; document.head.append(script);
  }); return sdkPromise;
}
export interface VideoPreferences { channel: string; volume: number; muted: boolean; docked: boolean }
export function parseVideo(value: unknown, channels: readonly string[]): VideoPreferences {
  const defaults = { channel: channels[0] ?? 'hasanabi', volume: .5, muted: true, docked: false };
  if (!value || typeof value !== 'object') return defaults; const data = value as Record<string, unknown>;
  return { channel: typeof data.channel === 'string' && channels.includes(data.channel) ? data.channel : defaults.channel,
    volume: typeof data.volume === 'number' && Number.isFinite(data.volume) && data.volume >= 0 && data.volume <= 1 ? data.volume : .5, muted: typeof data.muted === 'boolean' ? data.muted : true, docked: data.docked === true };
}
export function twitchParent(hostname: string): string { if (!/^[a-z0-9.-]+$/i.test(hostname)) throw new Error('Invalid Twitch parent domain'); return hostname; }
export class VideoPanel {
  private floating: FloatingPanel;
  private options: VideoPreferences;
  private player: Player | undefined;
  private ready = false;
  private generation = 0;
  private container: HTMLElement;
  private status: HTMLElement;
  private channel: HTMLSelectElement;
  private volume: HTMLInputElement;
  private mute: HTMLButtonElement;
  private play: HTMLButtonElement;
  private dock: HTMLButtonElement;
  constructor(private root: HTMLElement, private trigger: HTMLButtonElement, channels: string[]) {
    this.options = parseVideo(null, channels); try { this.options = parseVideo(JSON.parse(localStorage.getItem('chatthing:v1:video') ?? 'null'), channels); } catch { /* optional storage */ }
    this.container = root.querySelector<HTMLElement>('#video-player')!; this.status = root.querySelector<HTMLElement>('#video-status')!;
    this.channel = root.querySelector<HTMLSelectElement>('#video-channel')!; this.volume = root.querySelector<HTMLInputElement>('#video-volume')!;
    this.mute = root.querySelector<HTMLButtonElement>('#video-mute')!; this.play = root.querySelector<HTMLButtonElement>('#video-play')!; this.dock = root.querySelector<HTMLButtonElement>('#video-dock')!;
    for (const name of channels) { const option = document.createElement('option'); option.value = name; option.textContent = '#' + name; this.channel.append(option); }
    this.channel.value = this.options.channel; this.volume.value = String(this.options.volume);
    this.floating = new FloatingPanel(root, root.querySelector<HTMLElement>('#video-handle')!, root.querySelector<HTMLButtonElement>('#video-pin')!, 'chatthing:v1:video:geometry');
    root.classList.toggle('video-docked', this.options.docked); this.paint();
    trigger.addEventListener('click', this.toggle); root.querySelector('#video-close')?.addEventListener('click', this.close); this.channel.addEventListener('change', this.changeChannel); this.volume.addEventListener('input', this.changeVolume); this.mute.addEventListener('click', this.changeMute); this.play.addEventListener('click', this.playPause); this.dock.addEventListener('click', this.changeDock);
    if (this.floating.reopen) this.open();
  }
  private paint(): void { this.mute.textContent = this.options.muted ? 'Unmute' : 'Mute'; this.mute.setAttribute('aria-pressed', String(this.options.muted)); this.dock.textContent = this.options.docked ? 'Float' : 'Dock'; this.play.disabled = !this.ready; this.volume.disabled = !this.ready; this.mute.disabled = !this.ready; }
  private save(): void { try { localStorage.setItem('chatthing:v1:video', JSON.stringify(this.options)); } catch { /* optional storage */ } }
  float():void {this.options.docked=false;this.root.classList.remove('video-docked');this.save();this.open();}
  showRail(open:boolean):void {if(open)this.open();else {if(this.ready)this.player?.pause();this.root.hidden=true;this.trigger.setAttribute('aria-expanded','false');}}
  private open(): void {
    this.root.hidden = false; this.trigger.setAttribute('aria-expanded', 'true'); this.floating.opened();
    const link = this.root.querySelector<HTMLAnchorElement>('#video-external')!; link.href = 'https://www.twitch.tv/' + this.options.channel;
    if (innerWidth < 448) { this.status.textContent = 'Open Twitch for video on this narrow screen'; return; }
    if (this.player) return; const generation = ++this.generation; this.status.textContent = 'Loading Twitch player…';
    void sdk().then(api => {
      if (generation !== this.generation || this.root.hidden) return;
      this.player = new api.Player(this.container.id, { width: '100%', height: '100%', channel: this.options.channel, parent: [twitchParent(location.hostname)], autoplay: false, muted: this.options.muted });
      this.player.addEventListener(api.Player.READY, () => { if (generation !== this.generation) return; this.ready = true; this.player?.setVolume(this.options.volume); this.player?.setMuted(this.options.muted); this.status.textContent = 'Player ready'; this.paint(); });
      this.player.addEventListener(api.Player.OFFLINE, () => { if (generation === this.generation) this.status.textContent = 'Stream offline'; });
      this.player.addEventListener(api.Player.ONLINE, () => { if (generation === this.generation) this.status.textContent = 'Stream online'; });
      this.player.addEventListener(api.Player.PLAYBACK_BLOCKED, () => { if (generation === this.generation) this.status.textContent = 'Press Play to start video'; });
      for (const event of [api.Player.PLAY, api.Player.PAUSE]) this.player.addEventListener(event, () => { if (generation === this.generation) this.play.textContent = this.player?.isPaused() ? 'Play' : 'Pause'; });
    }).catch(() => { if (generation === this.generation) this.status.textContent = 'Twitch player unavailable; open Twitch or try again'; });
  }
  private toggle = (): void => { if (this.root.hidden) this.open(); else this.close(); };
  private close = (): void => { if (this.ready) this.player?.pause(); this.root.hidden = true; this.trigger.setAttribute('aria-expanded', 'false'); this.floating.closed(); this.trigger.focus(); };
  private changeChannel = (): void => { this.options.channel = this.channel.value; if (this.ready) this.player?.setChannel(this.options.channel); this.root.querySelector<HTMLAnchorElement>('#video-external')!.href = 'https://www.twitch.tv/' + this.options.channel; this.save(); };
  private changeVolume = (): void => { this.options.volume = Math.max(0, Math.min(1, Number(this.volume.value))); if (this.ready) this.player?.setVolume(this.options.volume); this.save(); };
  private changeMute = (): void => { this.options.muted = !this.options.muted; if (this.ready) this.player?.setMuted(this.options.muted); this.paint(); this.save(); };
  private playPause = (): void => { if (!this.ready) return; if (this.player?.isPaused()) this.player.play(); else this.player?.pause(); };
  private changeDock = (): void => { this.options.docked = !this.options.docked; this.root.classList.toggle('video-docked', this.options.docked); this.paint(); this.save(); };
  stop(): void { this.generation++; if (this.ready) this.player?.pause(); this.container.replaceChildren(); this.floating.stop(); this.trigger.removeEventListener('click', this.toggle); this.root.querySelector('#video-close')?.removeEventListener('click', this.close); this.channel.removeEventListener('change', this.changeChannel); this.volume.removeEventListener('input', this.changeVolume); this.mute.removeEventListener('click', this.changeMute); this.play.removeEventListener('click', this.playPause); this.dock.removeEventListener('click', this.changeDock); }
}
