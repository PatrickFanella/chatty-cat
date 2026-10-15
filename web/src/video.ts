import { profileKey } from './account-profiles';
import { privacyEnabled } from './privacy';
import { TwitchVolume } from './twitch-volume';
import { registerSettings } from './settings-bundle';
import { FloatingPanel } from './floating';

export interface VideoPreferences {
  channel: string;
  volume: number;
  muted: boolean;
  docked: boolean;
  rememberVolume: boolean;
}
export function parseVideo(value: unknown, channels: readonly string[]): VideoPreferences {
  const defaults = {
    channel: channels[0] ?? 'hasanabi',
    volume: 0.5,
    muted: true,
    docked: false,
    rememberVolume: false,
  };
  if (!value || typeof value !== 'object') return defaults;
  const data = value as Record<string, unknown>;
  return {
    channel: typeof data.channel === 'string' && channels.includes(data.channel) ? data.channel : defaults.channel,
    volume:
      typeof data.volume === 'number' && Number.isFinite(data.volume) && data.volume >= 0 && data.volume <= 1
        ? data.volume
        : 0.5,
    muted: typeof data.muted === 'boolean' ? data.muted : true,
    docked: data.docked === true,
    rememberVolume: data.rememberVolume === true,
  };
}
export function twitchParent(hostname: string): string {
  if (!/^[a-z0-9.-]+$/i.test(hostname)) throw new Error('Invalid Twitch parent domain');
  return hostname;
}

export class VideoPanel {
  private bundleDispose: () => void;
  private volume = new TwitchVolume();
  private memory = document.createElement('button');
  private floating: FloatingPanel;
  private options: VideoPreferences;
  private container: HTMLElement;
  private status: HTMLElement;
  private channel: HTMLSelectElement;
  private dock: HTMLButtonElement;
  constructor(
    private root: HTMLElement,
    private trigger: HTMLButtonElement,
    channels: string[],
  ) {
    this.options = parseVideo(null, channels);
    try {
      this.options = parseVideo(JSON.parse(localStorage.getItem(profileKey('chatthing:v1:video')) ?? 'null'), channels);
    } catch {
      /* optional storage */
    }
    document.addEventListener('privacychange', this.privacyChanged);
    this.container = root.querySelector<HTMLElement>('#video-player')!;
    this.status = root.querySelector<HTMLElement>('#video-status')!;
    this.channel = root.querySelector<HTMLSelectElement>('#video-channel')!;
    this.dock = root.querySelector<HTMLButtonElement>('#video-dock')!;
    for (const name of channels) {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = '#' + name;
      this.channel.append(option);
    }
    this.channel.value = this.options.channel;
    this.floating = new FloatingPanel(
      root,
      root.querySelector<HTMLElement>('#video-handle')!,
      root.querySelector<HTMLButtonElement>('#video-pin')!,
      profileKey('chatthing:v1:video:geometry'),
    );
    this.memory.type = 'button';
    this.memory.id = 'video-memory';
    this.memory.textContent = 'Remember Twitch volume';
    this.memory.setAttribute('aria-pressed', String(this.options.rememberVolume));
    root.querySelector('#video-dock')?.after(this.memory);
    this.memory.addEventListener('click', this.remember);
    root.classList.toggle('video-docked', this.options.docked);
    this.paint();
    trigger.addEventListener('click', this.toggle);
    root.querySelector('#video-close')?.addEventListener('click', this.close);
    this.channel.addEventListener('change', this.changeChannel);
    this.dock.addEventListener('click', this.changeDock);
    this.bundleDispose = registerSettings(
      'video',
      () => ({ options: this.options, floating: this.floating.state() }),
      (value) => {
        if (!value || typeof value !== 'object') return;
        const data = value as Record<string, unknown>;
        if (!data.options || typeof data.options !== 'object' || !this.floating.restore(data.floating)) return;
        this.options = parseVideo(data.options, channels);
        this.channel.value = this.options.channel;
        this.volume.stop();
        this.container.replaceChildren();
        this.memory.setAttribute('aria-pressed', String(this.options.rememberVolume));
        this.root.classList.toggle('video-docked', this.options.docked);
        this.root.querySelector<HTMLAnchorElement>('#video-external')!.href =
          'https://www.twitch.tv/' + this.options.channel;
        this.paint();
        this.save();
        if (this.root.dataset.rail === 'true') {
          if (!this.root.hidden) this.open();
        } else if (this.floating.reopen) this.open();
        else this.hide();
      },
    );
    const query = new URL(location.href).searchParams,
      mode = query.get('video');
    if (query.has('video')) {
      this.options.docked = mode === 'dock';
      this.root.classList.toggle('video-docked', this.options.docked);
      this.paint();
      if (mode === 'off' || mode === '0') this.hide();
      else this.open();
    } else if (this.floating.reopen) this.open();
    document.addEventListener('share-settings', this.share);
  }
  private paint(): void {
    this.dock.textContent = this.options.docked ? 'Float' : 'Dock';
  }
  private save(): void {
    try {
      localStorage.setItem(profileKey('chatthing:v1:video'), JSON.stringify(this.options));
    } catch {
      /* optional storage */
    }
  }
  float(): void {
    this.options.docked = false;
    this.root.classList.remove('video-docked');
    this.save();
    this.open();
  }
  showRail(open: boolean): void {
    if (open) this.open();
    else this.hide();
  }
  private open(): void {
    this.root.hidden = false;
    this.trigger.setAttribute('aria-expanded', 'true');
    this.floating.opened();
    if (privacyEnabled()) {
      this.volume.stop();
      this.container.replaceChildren();
      this.status.textContent = 'Video is hidden in privacy mode';
      return;
    }
    this.root.querySelector<HTMLAnchorElement>('#video-external')!.href =
      'https://www.twitch.tv/' + this.options.channel;
    if (innerWidth < 448) {
      this.status.textContent = 'Open Twitch for video on this narrow screen';
      return;
    }
    if (this.container.querySelector('iframe')) return;
    const query = new URLSearchParams({
      channel: this.options.channel,
      parent: twitchParent(location.hostname),
      autoplay: 'false',
      muted: String(this.options.muted),
    });
    const frame = document.createElement('iframe');
    frame.title = 'Twitch video · ' + this.options.channel;
    frame.src = 'https://player.twitch.tv/?' + query;
    frame.allow = 'autoplay; fullscreen';
    frame.allowFullscreen = true;
    frame.width = '100%';
    frame.height = '100%';
    this.container.replaceChildren(frame);
    if (this.options.rememberVolume) void this.mountVolume();
    this.status.textContent = 'Use Twitch’s player controls for playback, sound and quality';
  }
  private privacyChanged = (): void => {
    if (privacyEnabled()) {
      this.volume.stop();
      this.container.replaceChildren();
    } else if (!this.root.hidden) this.open();
  };
  private hide(): void {
    this.volume.stop();
    // Removing the official frame stops playback without a separate SDK script.
    this.container.replaceChildren();
    this.root.hidden = true;
    this.trigger.setAttribute('aria-expanded', 'false');
  }
  private toggle = (): void => {
    if (this.root.hidden) this.open();
    else this.close();
  };
  private close = (): void => {
    this.hide();
    this.floating.closed();
    this.trigger.focus();
  };
  private changeChannel = (): void => {
    this.volume.stop();
    this.options.channel = this.channel.value;
    this.save();
    this.container.replaceChildren();
    this.root.querySelector<HTMLAnchorElement>('#video-external')!.href =
      'https://www.twitch.tv/' + this.options.channel;
    if (!this.root.hidden) this.open();
  };
  private changeDock = (): void => {
    this.options.docked = !this.options.docked;
    this.root.classList.toggle('video-docked', this.options.docked);
    this.paint();
    this.save();
  };
  private mountVolume = async (): Promise<void> => {
    const channel = this.options.channel;
    const loaded = await this.volume.mount(
      this.container,
      channel,
      this.options.volume,
      this.options.muted,
      (volume, muted) => {
        if (this.options.volume !== volume || this.options.muted !== muted) {
          this.options.volume = volume;
          this.options.muted = muted;
          this.save();
        }
      },
    );
    if (!loaded && !this.root.hidden && this.options.rememberVolume && channel === this.options.channel)
      this.status.textContent = 'Volume memory unavailable · Twitch controls remain available';
  };
  private remember = (): void => {
    this.options.rememberVolume = !this.options.rememberVolume;
    this.memory.setAttribute('aria-pressed', String(this.options.rememberVolume));
    this.save();
    if (this.options.rememberVolume && !this.root.hidden) void this.mountVolume();
    else this.volume.stop();
  };
  private share = (event: Event): void => {
    if (event instanceof CustomEvent && event.detail instanceof URL)
      event.detail.searchParams.set(
        'video',
        this.root.hidden ? 'off' : this.root.dataset.rail === 'true' || this.options.docked ? 'dock' : 'float',
      );
  };
  stop(): void {
    document.removeEventListener('privacychange', this.privacyChanged);
    this.volume.stop();
    this.memory.removeEventListener('click', this.remember);
    document.removeEventListener('share-settings', this.share);
    this.bundleDispose();
    this.container.replaceChildren();
    this.floating.stop();
    this.trigger.removeEventListener('click', this.toggle);
    this.root.querySelector('#video-close')?.removeEventListener('click', this.close);
    this.channel.removeEventListener('change', this.changeChannel);
    this.dock.removeEventListener('click', this.changeDock);
  }
}
