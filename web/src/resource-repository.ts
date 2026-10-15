import { parsePreview } from './preview';
export class RepositoryDetails {
  private abort: AbortController | undefined;
  private cache = new Map<string, { text: string; until: number }>();
  constructor(private entries: { url: string; output: HTMLElement }[]) {}
  start(): void {
    if (this.abort) return;
    const abort = (this.abort = new AbortController());
    for (const { url, output } of this.entries) {
      const cached = this.cache.get(url);
      if (cached && cached.until > Date.now()) {
        output.textContent = cached.text;
        continue;
      }
      output.textContent = 'Repository metadata loading…';
      void (async () => {
        let text = 'Repository metadata unavailable',
          ttl = 60;
        try {
          const response = await fetch('/api/preview?url=' + encodeURIComponent(url), {
            signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]),
          });
          if (response.ok) {
            const card = parsePreview(await response.json());
            const expected = new URL(url).pathname.slice(1);
            if (
              ['GitHub', 'Gitea'].includes(card.site) &&
              card.title.toLowerCase() === expected.toLowerCase() &&
              card.description
            ) {
              text = card.description;
              ttl = card.ttl;
            }
          }
        } catch {
          /* Public repository metadata is optional. */
        }
        if (!abort.signal.aborted) {
          this.cache.set(url, { text, until: Date.now() + ttl * 1000 });
          output.textContent = text;
        }
      })();
    }
  }
  stop(): void {
    this.abort?.abort();
    this.abort = undefined;
  }
}
