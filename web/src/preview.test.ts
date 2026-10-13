// @vitest-environment happy-dom
import {linkDefaults,setLinkPreferences} from './link-preferences';
import { afterEach, expect, it, vi } from 'vitest';
import { LinkPreview, parsePreview, youtubeID } from './preview';
const card = { url: 'https://example.com/redirect', title: '<script>Title</script>', description: 'Description', site: 'Example', image: 'https://cdn.example/image.png', icon: '', author: 'Alice', published: '', contentType: 'video/mp4', ttl: 86400 };
let preview: LinkPreview | undefined;
afterEach(() => { preview?.stop(); preview = undefined;setLinkPreferences(linkDefaults);localStorage.clear(); vi.unstubAllGlobals(); vi.useRealTimers(); document.body.replaceChildren();delete document.documentElement.dataset.peek;delete document.documentElement.dataset.yt; });
function setup() {
setLinkPreferences({...linkDefaults,enabled:true,tooltip:true,thumbnails:true});
  vi.useFakeTimers(); const log = document.createElement('main'); const anchor = document.createElement('button'); anchor.dataset.preview = 'https://example.com/source'; log.append(anchor); const root = document.createElement('section'); root.hidden = true; document.body.append(log, root);
  preview = new LinkPreview(log, root); return { log, anchor, root };
}
it('validates URLs, fields and TTL and recognizes only YouTube hosts', () => {
  expect(parsePreview(card).title).toBe(card.title); expect(() => parsePreview({ ...card, image: 'javascript:evil' })).toThrow(); expect(() => parsePreview({ ...card, ttl: Infinity })).toThrow();
  expect(youtubeID('https://youtu.be/abcdefghijk')).toBe('abcdefghijk'); expect(youtubeID('https://www.youtube.com/watch?v=abcdefghijk')).toBe('abcdefghijk'); expect(youtubeID('https://evil.com/watch?v=abcdefghijk')).toBeUndefined();
});
it('recognizes live, short, embedded and music videos without matching channel or extra paths', () => {
  for (const url of ['https://www.youtube.com/live/abcdefghijk', 'https://www.youtube.com/shorts/abcdefghijk', 'https://m.youtube.com/embed/abcdefghijk', 'https://music.youtube.com/watch?v=abcdefghijk']) expect(youtubeID(url)).toBe('abcdefghijk');
  for (const url of ['https://youtube.com.evil.net/watch?v=abcdefghijk', 'https://www.youtube.com/@creator?v=abcdefghijk', 'https://www.youtube.com/live/abcdefghijk/more', 'https://youtu.be/abcdefghijk/more', 'https://user@youtube.com/watch?v=abcdefghijk']) expect(youtubeID(url)).toBeUndefined();
});
it('loads a privacy-enhanced YouTube player only after selection with autoplay disabled', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...card, url: 'https://music.youtube.com/watch?v=abcdefghijk', contentType: 'text/html' }) }));
  const { anchor, root } = setup(); anchor.click(); await vi.advanceTimersByTimeAsync(0);
  expect(root.querySelector('iframe')).toBeNull();
  // Keep the structural player check detached so it does not fetch YouTube.
  root.remove();
  [...root.querySelectorAll('button')].find(button => button.textContent === 'Load media player')?.click();
  expect(root.querySelector('iframe')?.src).toBe('https://www.youtube-nocookie.com/embed/abcdefghijk?autoplay=0');
  expect(root.querySelector('iframe')?.title).toBe(card.title);
});
it('renders safe metadata, discloses redirects and loads media only on selection', async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => card }); vi.stubGlobal('fetch', fetcher); const { anchor, root } = setup(); anchor.click(); await vi.advanceTimersByTimeAsync(0);
  expect(root.querySelector('script')).toBeNull(); expect(root.textContent).toContain(card.title); expect(root.querySelector('.preview-redirect')?.textContent).toContain(card.url);
  expect(root.querySelector('video')).toBeNull(); [...root.querySelectorAll('button')].find(button => button.textContent === 'Load media player')?.click();
  expect(root.querySelector('video')?.autoplay).toBe(false); expect(root.querySelector('video')?.preload).toBe('none');
  root.querySelector<HTMLButtonElement>('[data-close-preview]')?.click(); expect(root.hidden).toBe(true); expect(root.children).toHaveLength(0);
  anchor.click(); await vi.advanceTimersByTimeAsync(0); expect(fetcher).toHaveBeenCalledTimes(1);
});
it('debounces hover and preserves an external link after failure', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('unavailable'))); const { anchor, root } = setup(); anchor.dispatchEvent(new Event('pointerover', { bubbles: true })); await vi.advanceTimersByTimeAsync(300); expect(root.hidden).toBe(true);
  await vi.advanceTimersByTimeAsync(100); expect(root.hidden).toBe(false); expect(root.textContent).toContain('Preview unavailable'); expect(root.querySelector('a')?.href).toBe('https://example.com/source');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); expect(root.hidden).toBe(true);
});
it('plays a provider-supplied MP4 only after selection and retains its signed URL',async()=>{
 const video='https://cdn.example.net/media.mp4?signature=keep';vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({...card,contentType:'text/html',video})}));const {anchor,root}=setup();anchor.click();await vi.advanceTimersByTimeAsync(0);expect(root.querySelector('video')).toBeNull();[...root.querySelectorAll('button')].find(button=>button.textContent==='Load media player')!.click();expect(root.querySelector('video')?.src).toBe(video);expect(root.querySelector('video')?.autoplay).toBe(false);
 expect(()=>parsePreview({...card,video:'javascript:evil'})).toThrow();
});
it('loads native Twitch clips on selection and keeps a link on narrow screens',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({...card,url:'https://clips.twitch.tv/Clip-ID',contentType:'text/html'})}));const {anchor,root}=setup();anchor.click();await vi.advanceTimersByTimeAsync(0);expect(root.querySelector('iframe')).toBeNull();root.remove();[...root.querySelectorAll('button')].find(button=>button.textContent==='Load Twitch player')!.click();expect(new URL(root.querySelector('iframe')!.src).searchParams.get('autoplay')).toBe('false');
 root.querySelector<HTMLButtonElement>('[data-close-preview]')!.click();vi.stubGlobal('innerWidth',375);anchor.click();await vi.advanceTimersByTimeAsync(0);expect(root.textContent).not.toContain('Load Twitch player');expect(root.querySelector('a')?.href).toBe('https://clips.twitch.tv/Clip-ID');
});
it('respects off, text, icon and YouTube preferences and closes on changes', async()=>{
 const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({...card,icon:'https://example.com/icon.png',url:'https://youtu.be/abcdefghijk',contentType:'text/html'})});vi.stubGlobal('fetch',fetcher);
 const {anchor,root}=setup();document.documentElement.dataset.peek='0';anchor.click();await vi.advanceTimersByTimeAsync(0);expect(fetcher).not.toHaveBeenCalled();
 document.documentElement.dataset.peek='1';anchor.click();await vi.advanceTimersByTimeAsync(0);expect(root.textContent).toContain(card.title);expect(root.querySelector('img')).toBeNull();expect(root.textContent).not.toContain('Load media player');
 document.documentElement.dataset.peek='3';anchor.click();await vi.advanceTimersByTimeAsync(0);expect(root.querySelectorAll('img')).toHaveLength(1);expect(root.textContent).not.toContain('Load media player');
 document.documentElement.dataset.peek='2';document.documentElement.dataset.yt='false';anchor.click();await vi.advanceTimersByTimeAsync(0);expect(root.textContent).not.toContain('Load media player');
 document.documentElement.dataset.yt='true';anchor.click();await vi.advanceTimersByTimeAsync(0);expect(root.textContent).toContain('Load media player');document.dispatchEvent(new Event('previewsettings'));expect(root.hidden).toBe(true);
});

it('asks before a one-time fetch, suppresses unsolicited hover and drops privacy-late responses',async()=>{let finish:(v:unknown)=>void=()=>{};const fetcher=vi.fn(()=>new Promise(resolve=>{finish=resolve;}));vi.stubGlobal('fetch',fetcher);const {anchor,root}=setup();setLinkPreferences(linkDefaults);anchor.dispatchEvent(new Event('pointerover',{bubbles:true}));await vi.advanceTimersByTimeAsync(400);expect(fetcher).not.toHaveBeenCalled();anchor.click();expect(root.textContent).toContain('Fetch one public preview');expect(fetcher).not.toHaveBeenCalled();[...root.querySelectorAll('button')].find(b=>b.textContent==='Fetch this preview once')!.click();expect(fetcher).toHaveBeenCalledOnce();localStorage.setItem('chatthing:v1:privacy',JSON.stringify({version:1,enabled:true,allowed:[],panic:true}));document.dispatchEvent(new Event('privacychange'));finish({ok:true,json:async()=>card});await vi.advanceTimersByTimeAsync(0);expect(root.hidden).toBe(true);expect(root.childElementCount).toBe(0);});
