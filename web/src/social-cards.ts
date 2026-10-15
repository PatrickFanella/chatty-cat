import { youtubeVideo, youtubeFrame } from './youtube';
import { parsePreview, previewMode, type PreviewCard } from './preview';
import { appendSocial, socialStatusURL } from './social-media';
export class SocialCards {
  private cache = new Map<string, { card: PreviewCard | undefined; until: number }>();
  private pending = new Set<string>();
  private queue: string[] = [];
  private active = 0;
  private abort = new AbortController();
  private frame = 0;
  constructor(private log: HTMLElement) {
    log.addEventListener('virtualpaint', this.schedule);
    log.addEventListener('click', this.play);
    document.addEventListener('previewsettings', this.settings);
    this.schedule();
  }
  private settings = (): void => {
    if (document.documentElement.dataset.yt === 'false') {
      for (const player of this.log.querySelectorAll('.youtube-inline-player')) player.remove();
      for (const button of this.log.querySelectorAll('[data-youtube]')) button.setAttribute('aria-expanded', 'false');
    }
    for (const card of this.log.querySelectorAll('.social-card')) card.remove();
    this.schedule();
  };
  private schedule = (): void => {
    if (!this.abort.signal.aborted && !this.frame)
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.scan();
      });
  };
  private scan(): void {
    if (this.abort.signal.aborted) return;
    const mode = previewMode();
    for (const card of this.log.querySelectorAll<HTMLElement>('.social-card'))
      if (!mode || card.dataset.mode !== String(mode)) card.remove();
    if (!mode) return;
    for (const link of this.log.querySelectorAll<HTMLAnchorElement>('a.chat-link')) {
      const video = document.documentElement.dataset.yt === 'false' ? undefined : youtubeVideo(link.href);
      const url =
        socialStatusURL(link.dataset.canonicalURL ?? link.href) ||
        (video ? 'https://www.youtube.com/watch?v=' + video.id : undefined);
      if (!url) continue;
      const row = link.closest<HTMLElement>('.row');
      if (!row) continue;
      const existing = Array.from(row.querySelectorAll<HTMLElement>('.social-card'));
      if (existing.length >= 4 || existing.some((card) => card.dataset.url === url)) continue;
      const cached = this.cache.get(url);
      if (cached && cached.until > Date.now()) {
        if (cached.card) this.paint(row, cached.card, url);
        continue;
      }
      if (!this.pending.has(url) && this.queue.length < 30) {
        this.pending.add(url);
        this.queue.push(url);
      }
    }
    this.pump();
  }
  private paint(row: HTMLElement, card: PreviewCard, url: string): void {
    if (!card.social && card.site !== 'YouTube') return;
    if (
      !card.social &&
      row.dataset.login === 'fossabot' &&
      /fear&|by hasanabi gaming/i.test(card.title + ' ' + card.description)
    )
      return;
    const section = document.createElement('section');
    section.className = 'social-card';
    section.dataset.mode = String(previewMode());
    section.dataset.url = url;
    section.setAttribute('aria-label', card.social ? 'X / Twitter card' : 'YouTube card');
    const title = document.createElement('a');
    title.href = card.url;
    title.target = '_blank';
    title.rel = 'noopener noreferrer';
    title.textContent = card.title + (card.published ? ' · ' + new Date(card.published).toLocaleString() : '');
    const text = document.createElement('p');
    text.textContent = card.description;
    section.append(title, text);
    if (card.social) appendSocial(section, card.social, previewMode() === 2);
    else if (previewMode() === 2 && card.image) {
      const image = document.createElement('img');
      image.className = 'youtube-thumb';
      image.src = card.image;
      image.alt = 'Video thumbnail';
      image.loading = 'lazy';
      image.referrerPolicy = 'no-referrer';
      image.addEventListener('error', () => image.remove(), { once: true });
      const play = document.createElement('button');
      play.type = 'button';
      const video = youtubeVideo(card.url);
      play.dataset.youtube =
        Array.from(row.querySelectorAll<HTMLAnchorElement>('a.chat-link')).find(
          (link) => youtubeVideo(link.href)?.id === video?.id,
        )?.href ?? card.url;
      play.setAttribute('aria-label', 'Load YouTube player');
      play.setAttribute('aria-expanded', 'false');
      play.append(image);
      section.append(play);
    }
    row.append(section);
  }
  private play = (event: MouseEvent): void => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>('button[data-youtube]');
    if (!button || document.documentElement.dataset.yt === 'false') return;
    const video = youtubeVideo(button.dataset.youtube ?? ''),
      row = button.closest<HTMLElement>('.row');
    if (!video || !row) return;
    event.preventDefault();
    const existing = row.querySelector<HTMLElement>('.youtube-inline-player');
    if (existing) {
      existing.remove();
      button.setAttribute('aria-expanded', 'false');
      return;
    }
    const box = document.createElement('section');
    box.className = 'youtube-inline-player';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Close YouTube player';
    close.addEventListener('click', () => {
      box.remove();
      button.setAttribute('aria-expanded', 'false');
      button.focus();
    });
    box.append(close, youtubeFrame(video, 'YouTube video'));
    row.append(box);
    button.setAttribute('aria-expanded', 'true');
  };
  private pump(): void {
    while (this.active < 2 && this.queue.length) {
      const url = this.queue.shift()!;
      this.active++;
      void this.load(url).finally(() => {
        this.active--;
        this.pending.delete(url);
        this.schedule();
        this.pump();
      });
    }
  }
  private async load(url: string): Promise<void> {
    let card: PreviewCard | undefined;
    try {
      const response = await fetch('/api/preview?url=' + encodeURIComponent(url), {
        credentials: 'omit',
        signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(15000)]),
      });
      if (!response.ok) throw new Error('Unavailable');
      card = parsePreview(await response.json());
      if (!card.social && !(card.site === 'YouTube' && youtubeVideo(card.url))) card = undefined;
    } catch {
      /* original URL remains readable */
    }
    if (this.abort.signal.aborted) return;
    this.cache.delete(url);
    this.cache.set(url, { card, until: Date.now() + (card?.ttl ?? 60) * 1000 });
    while (this.cache.size > 256) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
      else break;
    }
  }
  stop(): void {
    this.abort.abort();
    cancelAnimationFrame(this.frame);
    this.log.removeEventListener('virtualpaint', this.schedule);
    this.log.removeEventListener('click', this.play);
    document.removeEventListener('previewsettings', this.settings);
    this.queue = [];
    this.pending.clear();
    this.cache.clear();
  }
}
