// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { LinkPreview, parsePreview, youtubeID } from './preview';
const card = { url: 'https://example.com/redirect', title: '<script>Title</script>', description: 'Description', site: 'Example', image: 'https://cdn.example/image.png', icon: '', author: 'Alice', published: '', contentType: 'video/mp4', ttl: 86400 };
let preview: LinkPreview | undefined;
afterEach(() => { preview?.stop(); preview = undefined; vi.unstubAllGlobals(); vi.useRealTimers(); document.body.replaceChildren();delete document.documentElement.dataset.peek;delete document.documentElement.dataset.yt; });
function setup() {
  vi.useFakeTimers(); const log = document.createElement('main'); const anchor = document.createElement('button'); anchor.dataset.preview = 'https://example.com/source'; log.append(anchor); const root = document.createElement('section'); root.hidden = true; document.body.append(log, root);
  preview = new LinkPreview(log, root); return { log, anchor, root };
}
it('validates URLs, fields and TTL and recognizes only YouTube hosts', () => {
  expect(parsePreview(card).title).toBe(card.title); expect(() => parsePreview({ ...card, image: 'javascript:evil' })).toThrow(); expect(() => parsePreview({ ...card, ttl: Infinity })).toThrow();
  expect(youtubeID('https://youtu.be/abcdefghijk')).toBe('abcdefghijk'); expect(youtubeID('https://www.youtube.com/watch?v=abcdefghijk')).toBe('abcdefghijk'); expect(youtubeID('https://evil.com/watch?v=abcdefghijk')).toBeUndefined();
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
it('respects off, text, icon and YouTube preferences and closes on changes', async()=>{
 const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({...card,icon:'https://example.com/icon.png',url:'https://youtu.be/abcdefghijk',contentType:'text/html'})});vi.stubGlobal('fetch',fetcher);
 const {anchor,root}=setup();document.documentElement.dataset.peek='0';anchor.click();await vi.advanceTimersByTimeAsync(0);expect(fetcher).not.toHaveBeenCalled();
 document.documentElement.dataset.peek='1';anchor.click();await vi.advanceTimersByTimeAsync(0);expect(root.textContent).toContain(card.title);expect(root.querySelector('img')).toBeNull();expect(root.textContent).not.toContain('Load media player');
 document.documentElement.dataset.peek='3';anchor.click();await vi.advanceTimersByTimeAsync(0);expect(root.querySelectorAll('img')).toHaveLength(1);expect(root.textContent).not.toContain('Load media player');
 document.documentElement.dataset.peek='2';document.documentElement.dataset.yt='false';anchor.click();await vi.advanceTimersByTimeAsync(0);expect(root.textContent).not.toContain('Load media player');
 document.documentElement.dataset.yt='true';anchor.click();await vi.advanceTimersByTimeAsync(0);expect(root.textContent).toContain('Load media player');document.dispatchEvent(new Event('previewsettings'));expect(root.hidden).toBe(true);
});
