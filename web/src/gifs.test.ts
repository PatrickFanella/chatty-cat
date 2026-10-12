// @vitest-environment happy-dom
import {expect,it} from 'vitest';
import {nativeGifTitle,gifTitleLink} from './gifs';
it('normalizes native GIF titles while preserving ordinary by phrases and display text',()=>{
 const gif=nativeGifTitle('[Stand by me GIF by Studio]')!;expect(gif.query).toBe('Stand by me Studio');expect(gif.label).toBe('[Stand by me GIF by Studio]');expect(gif.page).toBe('https://giphy.com/search/Stand-by-me-Studio');
 for(const text of ['hello GIF','[cat]','[GIF] extra','[cat GIF][dog]'])expect(nativeGifTitle(text)).toBeUndefined();
 expect(nativeGifTitle('[GIF]')?.query).toBe('GIF');
});
it('bounds search queries and renders a safe fallback link without HTML',()=>{
 expect(nativeGifTitle('['+'a'.repeat(300)+' GIF]')?.query).toHaveLength(200);
 const link=gifTitleLink(nativeGifTitle('[<script> GIF by Studio]')!);expect(link.querySelector('script')).toBeNull();expect(link.textContent).toContain('<script>');expect(link.dataset.gifQuery).toBe('<script> Studio');expect(new URL(link.href).hostname).toBe('giphy.com');
});
