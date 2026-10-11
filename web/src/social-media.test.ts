// @vitest-environment happy-dom
import {expect,it} from 'vitest';
import {appendSocial,parseSocial,socialStatusURL} from './social-media';
const media={avatar:'https://pbs.twimg.com/a.png',quote:'<script>quote</script>',photos:[{url:'https://pbs.twimg.com/p.png',alt:'Photo'}],videos:[{url:'https://video.twimg.com/v.mp4?tag=1',thumb:'https://pbs.twimg.com/t.png',kind:'gif' as const,width:640,height:480}]};
it('accepts normalized public media and rejects arbitrary hosts, shapes and dimensions',()=>{
 expect(parseSocial(media)?.videos[0]?.url).toBe(media.videos[0]!.url);expect(parseSocial(undefined)).toBeUndefined();
 for(const value of [null,{}, {...media,avatar:'https://user:pass@pbs.twimg.com/a'}, {...media,photos:[{url:'https://evil.test/a.png',alt:''}]},{...media,videos:[{...media.videos[0],width:-1}]},{...media,photos:Array(5).fill(media.photos[0])}])expect(()=>parseSocial(value)).toThrow();
});
it('renders safe quoted text and loads a sandboxed no-referrer player on selection',()=>{
 const root=document.createElement('section');appendSocial(root,media,true);expect(root.querySelector('script')).toBeNull();expect(root.querySelector('blockquote')?.textContent).toContain('<script>');expect(root.querySelector('iframe')).toBeNull();
 root.querySelector<HTMLButtonElement>('.social-video button')!.click();const iframe=root.querySelector('iframe')!;expect(iframe.getAttribute('sandbox')).toBe('');expect(iframe.srcdoc).toContain('no-referrer');expect(iframe.srcdoc).toContain('muted');expect(iframe.srcdoc).not.toContain('autoplay');expect(iframe.srcdoc).not.toContain('<script');expect(root.querySelector('.social-video a')).not.toBeNull();
 const textOnly=document.createElement('section');appendSocial(textOnly,media,false);expect(textOnly.querySelector('img')).toBeNull();expect(textOnly.querySelector('button')).toBeNull();
});
it('recognizes only real social status paths and removes tracking / media suffixes',()=>{
 expect(socialStatusURL('https://twitter.com/alice/status/123/photo/1?utm_source=a')).toBe('https://x.com/alice/status/123');
 for(const url of ['https://x.com.evil.test/alice/status/123','https://x.com/alice','https://x.com/alice/status/abc','https://user:pass@x.com/alice/status/123'])expect(socialStatusURL(url)).toBeUndefined();
});
