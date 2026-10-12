import { parseMetadata } from './metadata';
export class ResourceStreams {
  private abort: AbortController | undefined;
  private cache = new Map<string, { until: number; title: string; live: boolean }>();
  constructor(private root: HTMLElement) {}
  start(): void {
    if (this.abort) return; const abort = this.abort = new AbortController();
    const links = [...this.root.querySelectorAll<HTMLAnchorElement>('a[data-channel-link]')];
    const channels = [...new Set(links.map(link => new URL(link.href).searchParams.get('channel') ?? '').filter(channel => /^[a-z0-9_]{1,25}$/.test(channel)))].slice(0, 100);
    const paint = (channel: string, value: { title: string; live: boolean }): void => {
      if (abort.signal.aborted) return;
      for (const link of links) if (new URL(link.href).searchParams.get('channel') === channel) {
        link.dataset.live = String(value.live); link.title = '#' + channel + ' · ' + (value.live ? 'Live' : 'Observed offline') + (value.title ? ' · ' + value.title : '');
      }
    };
    let index = 0;
    const worker = async (): Promise<void> => {
      while (index < channels.length && !abort.signal.aborted) {
        const channel = channels[index++]!, cached = this.cache.get(channel);
        if (cached && cached.until > Date.now()) { paint(channel, cached); continue; }
        try {
          const response = await fetch('/api/channels/' + encodeURIComponent(channel), { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(25000)]) });
          if (!response.ok) continue; const data = parseMetadata(await response.json());
          if (!data || data.channel !== channel || !data.stream.uptime || data.errors.includes('stream uptime')) continue;
          const value = { live: !/offline|not streaming|not live|not online|not found/i.test(data.stream.uptime), title: data.stream.title, until: Date.now() + 300000 };
          if (!abort.signal.aborted) { this.cache.set(channel, value); paint(channel, value); }
        } catch { /* Unknown status retains the ordinary link. */ }
      }
    };
    void Promise.all([worker(), worker()]);
  }
  stop(): void { this.abort?.abort(); this.abort = undefined; }
}
