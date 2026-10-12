import {youtubeVideo,youtubeFrame} from './youtube';
import {parseSocial,appendSocial,type SocialMedia} from './social-media';
import { cleanURL } from './links';
export interface PreviewCard { social?:SocialMedia; url: string; title: string; description: string; site: string; image: string; icon: string; author: string; published: string; contentType: string; ttl: number }
export function parsePreview(value: unknown): PreviewCard {
  if (!value || typeof value !== 'object') throw new Error('Invalid preview'); const d = value as Record<string, unknown>;
  for (const key of ['url', 'title', 'description', 'site', 'image', 'icon', 'author', 'published', 'contentType']) if (typeof d[key] !== 'string') throw new Error('Invalid preview field');
  if (!cleanURL(String(d.url)) || ![d.image, d.icon].every(v => v === '' || typeof v === 'string' && !!cleanURL(v)) || typeof d.ttl !== 'number' || !Number.isSafeInteger(d.ttl) || d.ttl < 1 || d.ttl > 86400) throw new Error('Invalid preview URL/TTL');
  const social = parseSocial(d.social);
  return { ...(social ? { social } : {}), url: String(d.url).slice(0, 2048), title: String(d.title).slice(0, 300), description: String(d.description).slice(0, d.social?4000:1000), site: String(d.site).slice(0, 100), image: String(d.image).slice(0, 2048), icon: String(d.icon).slice(0, 2048), author: String(d.author).slice(0, 200), published: String(d.published).slice(0, 100), contentType: String(d.contentType).slice(0, 100), ttl: d.ttl };
}
export function youtubeID(raw:string):string|undefined {return youtubeVideo(raw)?.id;}
export function previewMode(): number { const value=Number(document.documentElement.dataset.peek??2);return [0,1,2,3].includes(value)?value:2; }
export class LinkPreview {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private abort: AbortController | undefined;
  private anchor: HTMLElement | undefined;
  private cache = new Map<string, { card: PreviewCard; until: number }>();
  private generation = 0;
  constructor(private log: HTMLElement, private root: HTMLElement) {
    log.addEventListener('pointerover', this.hover); log.addEventListener('pointerout', this.leave); log.addEventListener('focusin', this.hover);
    log.addEventListener('click', this.click); root.addEventListener('pointerenter', this.hold); root.addEventListener('pointerleave', this.leave); root.addEventListener('click', this.closeClick); document.addEventListener('keydown', this.key); document.addEventListener('previewsettings',this.close);
  }
  private hold = (): void => { clearTimeout(this.timer); };
  private hover = (event: Event): void => {
    if (!previewMode() || !(event.target instanceof Element)) return; const anchor = event.target.closest<HTMLElement>('.chat-link,[data-preview]'); if (!anchor) return;
    if (this.anchor === anchor && !this.root.hidden) { this.hold(); return; } this.hold(); this.timer = setTimeout(() => { void this.open(anchor); }, 350);
  };
  private leave = (event: Event): void => { if (event instanceof PointerEvent && event.relatedTarget instanceof Node && (this.root.contains(event.relatedTarget) || this.anchor?.contains(event.relatedTarget))) return; this.hold(); this.timer = setTimeout(this.close, 500); };
  private click = (event: MouseEvent): void => { if (!(event.target instanceof Element)) return; const button = event.target.closest<HTMLElement>('[data-preview]'); if (button) { event.preventDefault(); void this.open(button); } };
  private position(): void { if (!this.anchor) return; const r = this.anchor.getBoundingClientRect(); this.root.style.left = Math.max(12, Math.min(innerWidth - this.root.offsetWidth - 12, r.left)) + 'px'; this.root.style.top = Math.max(16, Math.min(innerHeight - this.root.offsetHeight - 16, r.bottom + 6)) + 'px'; }
  private async open(anchor: HTMLElement): Promise<void> {
    if(!previewMode())return;this.hold(); this.abort?.abort(); this.abort = new AbortController(); const generation = ++this.generation; this.anchor = anchor;
    const href = anchor.dataset.preview || (anchor instanceof HTMLAnchorElement ? anchor.href : ''); const url = cleanURL(href); if (!url) return;
    this.root.hidden = false; this.root.replaceChildren(); const close = document.createElement('button'); close.type = 'button'; close.dataset.closePreview = '1'; close.textContent = 'Close'; this.root.append(close, ' Loading preview…'); this.position();
    try {
      const cached = this.cache.get(url); let card: PreviewCard;
      if (cached && cached.until > Date.now()) card = cached.card;
      else { const response = await fetch('/api/preview?url=' + encodeURIComponent(url), { signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(15000)]) }); if (!response.ok) throw new Error('Unavailable'); card = parsePreview(await response.json()); if (this.cache.size >= 256) { const oldest = this.cache.keys().next().value; if (oldest) this.cache.delete(oldest); } this.cache.set(url, { card, until: Date.now() + card.ttl * 1000 }); }
      if (generation !== this.generation) return; this.root.replaceChildren(close);
      const heading = document.createElement('a'); heading.href = card.url; heading.target = '_blank'; heading.rel = 'noopener noreferrer'; heading.textContent = card.title || card.site; heading.className = 'preview-title'; this.root.append(heading);
      const info = document.createElement('p'); info.textContent = [card.site, card.author, card.published].filter(Boolean).join(' · '); this.root.append(info);
      if (card.url !== url) { const redirect = document.createElement('p'); redirect.textContent = 'Redirected to ' + card.url; redirect.className = 'preview-redirect'; this.root.append(redirect); }
      if (card.description) { const description = document.createElement('p'); description.textContent = card.description; this.root.append(description); }
      if (!card.social&&previewMode()===2 && card.image.startsWith('https:')) { const image = document.createElement('img'); image.src = card.image; image.alt = ''; image.loading = 'lazy'; image.addEventListener('error', () => image.remove(), { once: true }); this.root.append(image); }
      if(previewMode()>=2&&card.icon.startsWith('https:')){const icon=document.createElement('img');icon.src=card.icon;icon.alt='';icon.className='preview-icon';icon.referrerPolicy='no-referrer';icon.addEventListener('error',()=>icon.remove(),{once:true});heading.prepend(icon);}
      if(card.social)appendSocial(this.root,card.social,previewMode()===2);
      const youtube = document.documentElement.dataset.yt==='false'?undefined:youtubeVideo(card.url);
      if (previewMode()===2 && (youtube || card.contentType.startsWith('video/') || card.contentType.startsWith('audio/'))) {
        const play = document.createElement('button'); play.type = 'button'; play.textContent = 'Load media player'; play.addEventListener('click', () => {
          if (youtube) { this.root.append(youtubeFrame(youtube,card.title)); }
          else { const media = document.createElement(card.contentType.startsWith('audio/') ? 'audio' : 'video'); media.src = card.url; media.controls = true; media.preload = 'none'; this.root.append(media); }
          play.remove(); this.position();
        }, { once: true }); this.root.append(play);
      }
      this.position();
    } catch { if (generation === this.generation) { this.root.replaceChildren(close, ' Preview unavailable · '); const link = document.createElement('a'); link.href = url; link.textContent = 'Open link'; link.target = '_blank'; link.rel = 'noopener noreferrer'; this.root.append(link); } }
  }
  private closeClick = (event: MouseEvent): void => { if (event.target instanceof Element && event.target.closest('[data-close-preview]')) this.close(); };
  private key = (event: KeyboardEvent): void => { if (!this.root.hidden && event.key === 'Escape') this.close(); };
  private close = (): void => { this.hold(); this.generation++; this.abort?.abort(); this.root.hidden = true; this.root.replaceChildren(); this.anchor = undefined; };
  stop(): void { this.close(); this.log.removeEventListener('pointerover', this.hover); this.log.removeEventListener('pointerout', this.leave); this.log.removeEventListener('focusin', this.hover); this.log.removeEventListener('click', this.click); this.root.removeEventListener('pointerenter', this.hold); this.root.removeEventListener('pointerleave', this.leave); this.root.removeEventListener('click', this.closeClick); document.removeEventListener('keydown', this.key);document.removeEventListener('previewsettings',this.close); }
}
