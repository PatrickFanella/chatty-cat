// @vitest-environment happy-dom
import {afterEach,expect,it,vi} from 'vitest';
import {IdentityCards,emotePage,parseProfile} from './identity-cards';
let cards:IdentityCards|undefined;
afterEach(()=>{cards?.stop();document.body.replaceChildren();vi.unstubAllGlobals();vi.useRealTimers();});
it('validates public profile fields and provider destinations',()=>{
 const value={login:'alice',name:'Alice',bio:'hello',image:'https://example.com/avatar',color:'#123456',created:'2020-01-01',followers:42,partner:true,affiliate:false};expect(parseProfile(value,'alice')).toEqual(value);for(const bad of [{...value,login:'other'},{...value,image:'javascript:evil'},{...value,followers:-1},{...value,color:'red'}])expect(()=>parseProfile(bad,'alice')).toThrow();expect(emotePage('7TV','https://cdn.7tv.app/emote/abc/2x.webp')).toBe('https://7tv.app/emotes/abc');expect(emotePage('BTTV','https://cdn.betterttv.net/emote/abc/2x')).toBe('https://betterttv.com/emotes/abc');
});
it('opens safe profile and emote cards and drops late profile results',async()=>{
 vi.useFakeTimers();const surface=document.createElement('main');surface.innerHTML='<article class="row" data-login="alice"><a class="name">Alice</a><img class="emote" data-emote-source="7TV" data-emote-code="wave" alt="wave" src="https://cdn.7tv.app/emote/abc/2x.webp"></article>';const root=document.createElement('section');root.hidden=true;document.body.append(surface,root);
 const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({login:'alice',name:'Alice',bio:'<script>safe</script>',image:'',color:'#123456',created:'',followers:42,partner:false,affiliate:false})});vi.stubGlobal('fetch',fetcher);cards=new IdentityCards(surface,root,()=>[],async()=> 'they/them');
 surface.querySelector('a')?.dispatchEvent(new PointerEvent('pointerover',{bubbles:true}));await vi.advanceTimersByTimeAsync(350);expect(root.hidden).toBe(false);expect(root.textContent).toContain('they/them');expect(root.textContent).toContain('<script>safe</script>');expect(root.querySelector('script')).toBeNull();
 surface.querySelector('img')?.dispatchEvent(new PointerEvent('pointerover',{bubbles:true}));await vi.advanceTimersByTimeAsync(350);expect(root.querySelector<HTMLAnchorElement>('a')?.href).toBe('https://7tv.app/emotes/abc');expect(fetcher).toHaveBeenCalledOnce();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));expect(root.hidden).toBe(true);
});
it('links both current and legacy FFZ CDN paths to the provider page',()=>{expect(emotePage('FFZ','https://cdn.frankerfacez.com/emote/660211/2')).toBe('https://www.frankerfacez.com/emoticon/660211');expect(emotePage('FFZ','https://cdn.frankerfacez.com/emoticon/123/2')).toBe('https://www.frankerfacez.com/emoticon/123');});
