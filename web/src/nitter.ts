import { ownedInterval, clearOwnedInterval } from './resource-timers';
export function mirrorHost(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length > 256 ||
    !/^https:\/\/(?:[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(value)
  )
    return '';
  const host = new URL(value).hostname;
  if (/(?:^|\.)(?:localhost|local|internal|lan|home|corp|test|invalid)$/.test(host)) return '';
  return value;
}
export function twitterMirror(
  raw: string,
  host = mirrorHost(document.documentElement.dataset.nitter),
): string | undefined {
  host = mirrorHost(host);
  try {
    const url = new URL(raw);
    if (
      !['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'].includes(url.hostname) ||
      url.username ||
      url.password
    )
      return;
    const profile = /^\/([a-zA-Z0-9_]{1,15})\/?$/.exec(url.pathname);
    if (
      profile &&
      !['home', 'explore', 'search', 'login', 'signup', 'settings', 'intent', 'share', 'i'].includes(
        profile[1]!.toLowerCase(),
      )
    )
      return host ? host + '/' + profile[1] : 'https://bird.makeup/users/' + profile[1];
    if (host && /^\/(?:[a-zA-Z0-9_]{1,15}|i\/web)\/status\/[0-9]{1,30}\/?$/.test(url.pathname))
      return host + url.pathname;
  } catch {
    /* ordinary canonical link */
  }
}
export class NitterLinks {
  private abort = new AbortController();
  private timer: ReturnType<typeof setInterval>;
  private started = false;
  constructor(private log: HTMLElement) {
    log.addEventListener('virtualpaint', this.scan);
    this.timer = ownedInterval(
      'links.mirror',
      () => {
        if (this.started && !document.hidden) void this.poll();
      },
      900000,
    );
    this.scan();
  }
  private scan = (): void => {
    let needed = false;
    for (const link of this.log.querySelectorAll<HTMLAnchorElement>('a.chat-link')) {
      const canonical = link.dataset.canonicalURL ?? link.href;
      const mirror = twitterMirror(canonical);
      if (mirror === undefined && !/^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\//.test(canonical)) continue;
      needed = true;
      link.dataset.canonicalURL = canonical;
      link.dataset.preview = canonical;
      link.href = mirror ?? canonical;
      if (mirror) link.title = 'Open via ' + new URL(mirror).hostname;
      else link.removeAttribute('title');
    }
    if (needed && !this.started) {
      this.started = true;
      void this.poll();
    }
  };
  private async poll(): Promise<void> {
    try {
      const response = await fetch('/api/nitter', {
        credentials: 'omit',
        signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(8000)]),
      });
      if (!response.ok) return;
      const value: unknown = await response.json();
      if (!this.abort.signal.aborted) {
        document.documentElement.dataset.nitter = mirrorHost(
          value && typeof value === 'object' ? (value as Record<string, unknown>).host : '',
        );
        this.scan();
      }
    } catch {
      /* Canonical post links and profile fallback stay available. */
    }
  }
  stop(): void {
    this.abort.abort();
    clearOwnedInterval(this.timer);
    this.log.removeEventListener('virtualpaint', this.scan);
  }
}
