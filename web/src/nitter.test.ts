// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { mirrorHost, twitterMirror, NitterLinks } from './nitter';
afterEach(()=>{vi.unstubAllGlobals();delete document.documentElement.dataset.nitter;});
it('validates mirror origins and preserves canonical fallback for posts',()=>{
 for (const host of ['https://127.0.0.1','https://host.local','http://nitter.example.net','https://user@nitter.example.net','https://nitter.example.net/path']) expect(mirrorHost(host)).toBe('');
 expect(twitterMirror('https://x.com/one','')).toBe('https://bird.makeup/users/one');expect(twitterMirror('https://x.com/one/status/123','https://nitter.example.net')).toBe('https://nitter.example.net/one/status/123');expect(twitterMirror('https://x.com/one/status/123','')).toBeUndefined();expect(twitterMirror('https://x.com/home','')).toBeUndefined();
});
it('updates live links while retaining canonical URLs for card lookups',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({host:'https://nitter.example.net'})}));const log=document.createElement('main');log.innerHTML='<a class="chat-link" href="https://x.com/one/status/123">post</a>';const mirrors=new NitterLinks(log);await vi.waitFor(()=>expect(log.querySelector('a')?.href).toBe('https://nitter.example.net/one/status/123'));expect(log.querySelector('a')?.dataset.preview).toBe('https://x.com/one/status/123');mirrors.stop();
});
