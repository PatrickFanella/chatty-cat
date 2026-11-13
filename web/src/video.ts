import { profileKey } from './account-profiles';
import { privacyEnabled } from './privacy';
import { TwitchVolume } from './twitch-volume';
import { registerSettings } from './settings-bundle';
import { FloatingPanel } from './floating';

import { parseVideo, twitchParent, type VideoPreferences } from './video-preferences';
export { parseVideo, twitchParent } from './video-preferences';
export class VideoPanel {
  private bundleDispose: () => void;
  private volume = new TwitchVolume();
  private memory = document.createElement('button');
  private refresh = document.createElement('button');
  private signIn = document.createElement('a');
  private floating: FloatingPanel;
  private options: VideoPreferences;
  private container: HTMLElement;
  private status: HTMLElement;
  private channel: HTMLSelectElement;
  private dock: HTMLButtonElement;
  private controlsTimer: ReturnType<typeof setTimeout> | undefined;
  constructor(
    private root: HTMLElement,
    private trigger: HTMLButtonElement,
    channels: string[],
  ) {
    this.options = parseVideo(null, channels);
    try {
      this.options = parseVideo(
        JSON.parse(localStorage.getItem(profileKey('chatty-cat:v1:video')) ?? 'null'),
        channels,
      );
    } catch {
      /* optional storage */
    }
    document.addEventListener('privacychange', this.privacyChanged);
    root.addEventListener('pointerenter', this.holdControls);
    root.addEventListener('pointerleave', this.leaveControls);
    root.addEventListener('focusin', this.holdControls);
    root.addEventListener('focusout', this.leaveControls);
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
      profileKey('chatty-cat:v1:video:geometry'),
    );
    this.signIn.href = 'https://www.twitch.tv/login';
    this.signIn.target = '_blank';
    this.signIn.rel = 'noopener noreferrer';
    this.signIn.textContent = 'Player sign-in';
    this.signIn.title =
      'Sign in to Twitch for video. In the desktop app this opens Twitch inside the app; chat sign-in is separate. Close it and refresh the player when finished.';
    this.refresh.type = 'button';
    this.refresh.textContent = '↻';
    this.refresh.setAttribute('aria-label', 'Refresh video player');
    this.refresh.title = 'Reload the player after signing in to Twitch. Playback restarts.';
    this.refresh.addEventListener('click', this.reload);
    root.querySelector('.video-controls')?.append(this.signIn, this.refresh);
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
  private holdControls = (): void => {
    clearTimeout(this.controlsTimer);
    this.root.dataset.controlsOpen = 'true';
  };
  private leaveControls = (event: Event): void => {
    if (event instanceof PointerEvent) {
      const box = this.root.getBoundingClientRect();
      if (
        event.clientX >= box.left &&
        event.clientX <= box.right &&
        event.clientY >= box.top &&
        event.clientY <= box.bottom
      )
        return;
    }
    clearTimeout(this.controlsTimer);
    this.controlsTimer = setTimeout(() => {
      if (!this.root.contains(document.activeElement)) delete this.root.dataset.controlsOpen;
    }, 500);
  };
  private paint(): void {
    this.dock.textContent = this.options.docked ? 'Float' : 'Dock';
  }
  private save(): void {
    try {
      localStorage.setItem(profileKey('chatty-cat:v1:video'), JSON.stringify(this.options));
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
  open(): void {
    this.root.hidden = false;
    this.trigger.setAttribute('aria-expanded', 'true');
    this.floating.opened();
    if (privacyEnabled()) {
      this.volume.stop();
      this.container.replaceChildren();
      this.status.textContent = 'Video is hidden in privacy mode';
      delete this.status.dataset.hint;
      return;
    }
    this.root.querySelector<HTMLAnchorElement>('#video-external')!.href =
      'https://www.twitch.tv/' + this.options.channel;
    if (innerWidth < 448) {
      this.status.textContent = 'Open Twitch for video on this narrow screen';
      delete this.status.dataset.hint;
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
    this.status.dataset.hint = 'true';
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
  close = (): void => {
    this.hide();
    this.floating.closed();
    this.trigger.focus();
  };
  private reload = (): void => {
    if (privacyEnabled()) return;
    this.volume.stop();
    this.container.replaceChildren();
    if (!this.root.hidden) this.open();
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
    delete this.status.dataset.hint;
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
    clearTimeout(this.controlsTimer);
    this.root.removeEventListener('pointerenter', this.holdControls);
    this.root.removeEventListener('pointerleave', this.leaveControls);
    this.root.removeEventListener('focusin', this.holdControls);
    this.root.removeEventListener('focusout', this.leaveControls);
    delete this.root.dataset.controlsOpen;
    document.removeEventListener('privacychange', this.privacyChanged);
    this.volume.stop();
    this.refresh.removeEventListener('click', this.reload);
    this.refresh.remove();
    this.signIn.remove();
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
