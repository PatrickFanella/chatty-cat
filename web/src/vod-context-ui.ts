import { PRIVACY_KEY, privacyEnabled } from './privacy';
import { parseVodRange, vodOffset, vodTime, vodFrameURL, type VodMessage, type VodRange } from './vod-context';
export class VodContextPanel {
  readonly root = document.createElement('dialog');
  private timing = document.createElement('p');
  private status = document.createElement('p');
  private candidate = document.createElement('select');
  private frame = document.createElement('div');
  private verify: HTMLButtonElement;
  private load: HTMLButtonElement;
  private external = document.createElement('a');
  private message: VodMessage | undefined;
  private ranges: VodRange[] = [];
  private verified: VodRange | undefined;
  private account: string | undefined;
  private generation = 0;
  private controller: AbortController | undefined;
  constructor(
    private archives: (channel: string) => readonly VodRange[],
    private fetcher: typeof fetch = (input, init) => fetch(input, init),
  ) {
    this.root.id = 'vod-context';
    this.root.setAttribute('aria-label', 'VOD context');
    this.root.dataset.rail = 'true';
    const title = document.createElement('h2');
    title.textContent = 'VOD context';
    this.status.setAttribute('role', 'status');
    this.candidate.setAttribute('aria-label', 'Known archive range');
    this.candidate.addEventListener('change', this.changed);
    const help = document.createElement('p');
    help.textContent =
      'Offsets use Twitch archive creation time and duration, rounded down to whole seconds. Broadcast/chat delay and recording gaps can shift alignment; this is an estimate, not frame-accurate synchronization. Provider checks use public metadata cached for up to one minute. Missing, private or deleted VODs cannot be distinguished reliably.';
    this.verify = this.button('Verify archive', () => void this.check(false));
    this.load = this.button('Load VOD player', () => void this.check(true));
    this.external.textContent = 'Open verified VOD time on Twitch';
    this.external.target = '_blank';
    this.external.rel = 'noopener noreferrer';
    this.external.hidden = true;
    this.frame.className = 'vod-player';
    this.root.append(
      title,
      this.button('Close VOD context', () => this.close()),
      this.timing,
      help,
      this.candidate,
      this.verify,
      this.load,
      this.status,
      this.external,
      this.frame,
    );
    document.body.append(this.root);
    this.root.addEventListener('close', this.closed);
    document.addEventListener('privacychange', this.privacy);
    window.addEventListener('storage', this.storage);
    this.reset();
  }
  private button(name: string, action: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = name;
    b.addEventListener('click', () => {
      if (!privacyEnabled()) action();
    });
    return b;
  }
  setAccount(account: string | undefined): void {
    if (account === this.account) return;
    this.account = account;
    this.close();
  }
  show(message: VodMessage): void {
    if (
      privacyEnabled() ||
      !Number.isSafeInteger(message.timestamp) ||
      message.timestamp < 0 ||
      message.timestamp > 8640000000000000 ||
      !/^[a-z0-9_]{1,25}$/.test(message.channel)
    )
      return;
    this.reset();
    this.message = { channel: message.channel, timestamp: message.timestamp };
    const date = new Date(message.timestamp),
      zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    this.timing.textContent = `#${message.channel} · message UTC: ${date.toISOString()} · local (${zone}): ${date.toLocaleString()}`;
    this.ranges = this.archives(message.channel)
      .slice(0, 30)
      .flatMap((raw) => {
        const range = parseVodRange(raw);
        return range && vodOffset(range, message) !== undefined ? [range] : [];
      });
    for (const range of this.ranges) {
      const option = document.createElement('option');
      option.value = range.url;
      option.textContent =
        (range.title || 'Archive') +
        ' · UTC ' +
        new Date(range.start).toISOString() +
        ' → ' +
        new Date(range.end).toISOString();
      this.candidate.append(option);
    }
    this.verify.disabled = !this.ranges.length || this.account === undefined;
    this.status.textContent = this.ranges.length
      ? 'A retained range covers this timestamp. Verify its channel, timing and public availability before loading.'
      : 'No known archive range covers this time. A VOD may be unobserved, missing, private or deleted; no offset is available.';
    this.root.show();
    this.verify.focus();
  }
  private changed = (): void => {
    this.generation++;
    this.controller?.abort();
    this.frame.replaceChildren();
    this.verified = undefined;
    this.load.disabled = true;
    this.external.hidden = true;
    this.external.removeAttribute('href');
    this.verify.disabled = !this.ranges.length || this.account === undefined;
    this.status.textContent = 'Archive changed; verify it before loading';
  };
  private async check(play: boolean): Promise<void> {
    const message = this.message,
      candidate = this.ranges.find((r) => r.url === this.candidate.value);
    if (!message || !candidate || privacyEnabled() || this.account === undefined || (play && !this.verified)) return;
    this.controller?.abort();
    const controller = (this.controller = new AbortController()),
      generation = ++this.generation;
    this.frame.replaceChildren();
    this.load.disabled = this.verify.disabled = true;
    this.external.hidden = true;
    this.external.removeAttribute('href');
    this.verified = undefined;
    this.status.textContent = 'Checking public archive metadata…';
    try {
      const id = candidate.url.split('/').at(-1)!;
      const response = await this.fetcher('/api/channels/' + encodeURIComponent(message.channel) + '/vod/' + id, {
        cache: 'no-store',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
      });
      if (generation !== this.generation || privacyEnabled()) return;
      if (response.status === 404) throw new Error('VOD missing or no longer public; no verified offset is available');
      if (!response.ok) throw new Error('VOD verification unavailable; no verified offset is available');
      const range = parseVodRange(await response.json());
      if (generation !== this.generation || privacyEnabled()) return;
      const offset = range && vodOffset(range, message);
      if (!range || range.url !== candidate.url || offset === undefined)
        throw new Error('Current archive timing does not cover this message; no verified offset is available');
      this.verified = range;
      this.load.disabled = false;
      this.external.href = range.url + '?t=' + vodTime(offset);
      this.external.hidden = false;
      this.status.textContent = `Public archive verified · estimated offset ${vodTime(offset)} · UTC range ${new Date(range.start).toISOString()} → ${new Date(range.end).toISOString()}. Use Twitch controls to play, seek and change sound/quality.`;
      if (play) {
        if (innerWidth < 440) {
          this.status.textContent += ' Screen too narrow for the 400-pixel player; use the Twitch link.';
          return;
        }
        const iframe = document.createElement('iframe');
        iframe.title = 'Twitch VOD · ' + message.channel;
        iframe.src = vodFrameURL(range, message, location.hostname);
        iframe.allow = 'autoplay; fullscreen';
        iframe.allowFullscreen = true;
        iframe.width = '100%';
        iframe.height = '300';
        this.frame.append(iframe);
      }
    } catch (e) {
      if (generation === this.generation && !controller.signal.aborted)
        this.status.textContent = e instanceof Error ? e.message : 'VOD verification unavailable';
    } finally {
      if (generation === this.generation) this.verify.disabled = false;
    }
  }
  private reset(): void {
    this.generation++;
    this.controller?.abort();
    this.message = undefined;
    this.ranges = [];
    this.verified = undefined;
    this.candidate.replaceChildren();
    this.frame.replaceChildren();
    this.status.textContent = this.timing.textContent = '';
    this.load.disabled = this.verify.disabled = true;
    this.external.hidden = true;
    this.external.removeAttribute('href');
  }
  close(): void {
    this.reset();
    if (this.root.open) this.root.close();
  }
  private closed = (): void => {
    if (!this.root.open) this.reset();
  };
  private privacy = (): void => {
    if (privacyEnabled()) this.close();
  };
  private storage = (event: StorageEvent): void => {
    if (event.key === PRIVACY_KEY || event.key === null) this.privacy();
  };
  stop(): void {
    this.close();
    this.root.removeEventListener('close', this.closed);
    this.candidate.removeEventListener('change', this.changed);
    document.removeEventListener('privacychange', this.privacy);
    window.removeEventListener('storage', this.storage);
    this.root.remove();
  }
}
