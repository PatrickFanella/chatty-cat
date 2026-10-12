interface Gif {page: string; image: string; title: string}
function object(value: unknown): value is Record<string, unknown> {return !!value && typeof value === 'object' && !Array.isArray(value);}
function giphyURL(value: unknown, media: boolean): string | undefined {
  if (typeof value !== 'string' || value.length > 4096) return;
  try {const url = new URL(value); if (url.protocol !== 'https:' || url.username || url.password || url.port) return;
    if (media ? /^(?:media[0-9]*|i)\.giphy\.com$/.test(url.hostname) : ['giphy.com','www.giphy.com'].includes(url.hostname)) return value;
  } catch { /* invalid upstream URL */ }
}
export function firstGiphyResult(value: unknown): Gif | undefined {
  if (!object(value) || !Array.isArray(value.data)) return;
  const first: unknown = value.data[0];
  if (!object(first) || !object(first.images) || !object(first.images.fixed_height)) return;
  const page = giphyURL(first.url, false), image = giphyURL(first.images.fixed_height.url, true);
  if (page && image && typeof first.title === 'string') return {page, image, title:first.title.slice(0,300)};
}

export class GiphyTitles {
  private abort = new AbortController();
  private active = 0;
  private key: Promise<string> | undefined;
  private sent: number[] = [];
  private pause = 0;
  private safe = document.documentElement.dataset.gifsafe === 'true';
  constructor(private log: HTMLElement) {
    try { const value: unknown = JSON.parse(localStorage.getItem('chatthing:v1:giphy-budget') ?? 'null'); if (object(value)) { if (Array.isArray(value.sent)) this.sent = value.sent.filter((stamp): stamp is number => typeof stamp === 'number' && Number.isSafeInteger(stamp) && stamp <= Date.now() && stamp > Date.now() - 3600000).slice(-80); if (typeof value.pause === 'number' && value.pause <= Date.now() + 300000) this.pause = value.pause; } } catch { /* optional request budget */ }
    log.addEventListener('virtualpaint', this.paint); log.addEventListener('click', this.click); document.addEventListener('previewsettings', this.settings); this.paint();
  }
  private settings = (): void => { const safe = document.documentElement.dataset.gifsafe === 'true'; if (this.safe === safe) return; this.safe = safe; for (const result of this.log.querySelectorAll('.giphy-result')) result.remove(); for (const button of this.log.querySelectorAll<HTMLButtonElement>('.giphy-load')) { button.hidden = false; button.textContent = 'Load GIF'; } };
  private saveBudget(): void { try { localStorage.setItem('chatthing:v1:giphy-budget', JSON.stringify({sent:this.sent,pause:this.pause})); } catch { /* no media URLs are stored */ } }
  private paint = (): void => {
    for (const link of this.log.querySelectorAll<HTMLAnchorElement>('a.gif-title[data-gif-query]')) {
      if (link.nextElementSibling?.classList.contains('giphy-load')) continue;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'giphy-load'; button.textContent = 'Load GIF'; button.setAttribute('aria-label','Look up this GIF on GIPHY'); link.after(button);
    }
  };
  private configuration(): Promise<string> {
    this.key ??= fetch('/api/public-config', {signal:this.abort.signal, cache:'no-store'}).then(async response => {
      if (!response.ok) throw new Error('configuration unavailable');
      const value: unknown = await response.json(); return object(value) && typeof value.giphyApiKey === 'string' ? value.giphyApiKey : '';
    }).catch(() => {this.key = undefined; return '';});
    return this.key;
  }
  private click = (event: MouseEvent): void => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>('button.giphy-load');
    const link = button?.previousElementSibling;
    if (button && link instanceof HTMLAnchorElement && link.dataset.gifQuery) void this.load(button,link);
  };
  private async load(button: HTMLButtonElement, link: HTMLAnchorElement): Promise<void> {
    if (button.disabled) return;
    if (this.active >= 2) {button.textContent = 'Try again shortly'; return;}
    this.active++; button.disabled = true; button.textContent = 'Loading GIF…';
    try {
      const key = await this.configuration();
      if (!key) {button.textContent = 'GIPHY not configured'; return;}
      const query = link.dataset.gifQuery ?? '';
      if ([...query].length > 50) {button.textContent = 'Use the search link for this title'; return;}
      const now = Date.now(); this.sent = this.sent.filter(stamp => stamp > now - 3600000);
      if (now < this.pause || this.sent.length >= 80 || now - (this.sent.at(-1) ?? 0) < 1200) { button.textContent = 'GIF lookup paused · try later'; return; }
      this.sent.push(now); this.saveBudget(); const safe = this.safe;
      const url = new URL('https://api.giphy.com/v1/gifs/search');
      url.searchParams.set('api_key',key); url.searchParams.set('q',query); url.searchParams.set('limit','1'); if (safe) url.searchParams.set('rating','pg-13');
      const response = await fetch(url, {signal:AbortSignal.any([this.abort.signal,AbortSignal.timeout(8000)]),cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
      if (response.status === 429) { this.pause = Date.now() + 300000; this.saveBudget(); throw new Error('lookup paused'); }
      if (!response.ok) throw new Error('lookup unavailable');
      const raw = await response.text(); if (raw.length > 256000) throw new Error('response too large');
      const gif = firstGiphyResult(JSON.parse(raw));
      if (!gif) {button.textContent = 'No GIF found · use search link'; return;}
      if (!button.isConnected || this.abort.signal.aborted || safe !== this.safe) return;
      const result = document.createElement('span'); result.className = 'giphy-result';
      const mediaLink = document.createElement('a'); mediaLink.href = gif.page; mediaLink.target = '_blank'; mediaLink.rel = 'noopener noreferrer';
      const image = document.createElement('img'); image.src = gif.image; image.alt = gif.title || link.dataset.gifLabel || 'GIF'; image.className = 'chat-image'; image.referrerPolicy = 'no-referrer'; mediaLink.append(image);
      const attribution = document.createElement('a'); attribution.href = 'https://giphy.com/'; attribution.textContent = 'Powered by GIPHY'; attribution.target = '_blank'; attribution.rel = 'noopener noreferrer';
      result.append(mediaLink,attribution); button.hidden = true; button.after(result);
      image.addEventListener('error',()=>{result.remove();button.hidden=false;button.textContent='GIF unavailable · use search link';},{once:true});
    } catch {if (!this.abort.signal.aborted) button.textContent = 'GIF unavailable · try again';}
    finally {this.active--;button.disabled=false;}
  }
  stop(): void {this.abort.abort();this.saveBudget();document.removeEventListener('previewsettings',this.settings);this.log.removeEventListener('virtualpaint',this.paint);this.log.removeEventListener('click',this.click);}
}
