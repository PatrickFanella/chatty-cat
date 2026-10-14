// @vitest-environment happy-dom
import {afterEach,expect,it,vi} from 'vitest';
import {DesktopPlaybackPanel} from './desktop-companion-ui';
import {setProfileScope} from './account-profiles';
import {resetPrivacyFallback,savePrivacy} from './privacy';
const auth={enabled:true,authenticated:true,loginURL:'https://chat.subcult.tv/api/auth/login',userID:'42',login:'alice',csrf:'opaque'};
let panel:DesktopPlaybackPanel|undefined;
afterEach(()=>{panel?.stop();panel=undefined;document.body.replaceChildren();localStorage.clear();resetPrivacyFallback();setProfileScope('anonymous');vi.unstubAllGlobals();});
function button(text:string):HTMLButtonElement{const b=[...document.querySelectorAll('button')].find(b=>b.textContent===text);if(!b)throw new Error(text);return b;}
it('never launches on open, pairing or review; clears reviewed native action on privacy',async()=>{
 setProfileScope('42');document.body.innerHTML='<button id="commands-open"></button>';
 const fetcher=vi.fn().mockImplementation((url:string)=>Promise.resolve(new Response(JSON.stringify(url.endsWith('/v1/pair')?{version:1,account:'42',token:'a'.repeat(64)}:{version:1,platform:'darwin',tools:[{id:'mpv',label:'MPV',available:true}],jobs:[]}))));vi.stubGlobal('fetch',fetcher);
 panel=new DesktopPlaybackPanel(()=>auth,()=>['one'],()=> 'one');button('Desktop playback').click();expect(fetcher).not.toHaveBeenCalled();
 panel.root.querySelector('input')!.value='b'.repeat(64);button('Pair local companion').click();await vi.waitFor(()=>expect(document.querySelector('[role="status"]')?.textContent).toContain('Paired on darwin'));
 button('Review external playback').click();expect(button('Launch reviewed playback').disabled).toBe(false);expect(fetcher.mock.calls.every(c=>!String(c[0]).endsWith('/v1/launch'))).toBe(true);
 savePrivacy({version:1,enabled:true,allowed:[],panic:true});document.dispatchEvent(new Event('privacychange'));expect(panel.root.open).toBe(false);expect(button('Launch reviewed playback').disabled).toBe(true);expect(fetcher.mock.calls.every(c=>!String(c[0]).endsWith('/v1/launch'))).toBe(true);
});
