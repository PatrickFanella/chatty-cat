// @vitest-environment happy-dom
import {afterEach,expect,it,vi} from 'vitest';
import {DiscoveryPanel,parseDiscovery} from './discovery';
import type {AuthStatus} from './auth';
const auth:AuthStatus={enabled:true,authenticated:true,loginURL:'https://chat.subcult.tv/api/auth/login',userID:'42',login:'viewer',csrf:'fixture',followsEnabled:true,chattersEnabled:true};
const page={kind:'live',channel:'',accountID:'42',items:[{id:'100',login:'alice',name:'Alice',title:'Live title',category:'Music',viewers:10}],after:'next',total:0,observedAt:Date.now()};
let panel:DiscoveryPanel|undefined;afterEach(()=>{panel?.stop();localStorage.clear();document.body.replaceChildren();vi.restoreAllMocks();});
const flush=async()=>{await new Promise(r=>setTimeout(r,0));};
it('distinguishes an unknown login status from disabled login and clears stale notices when authorized',()=>{
 panel=new DiscoveryPanel(['bob'],vi.fn());
 const status=()=>panel!.root.querySelector('[role="status"]')?.textContent;
 expect(status()).toBe('Waiting for Twitch login status');
 panel.setAuth({...auth,enabled:false,authenticated:false});
 expect(status()).toBe('Twitch login is not configured');
 panel.setAuth(auth);
 expect(status()).toBe('Ready; load one page');
 expect(panel.root.querySelector<HTMLButtonElement>('button')!.disabled).toBe(false);
 panel.setAuth(undefined);
 expect(status()).toBe('Waiting for Twitch login status');
 expect(panel.root.querySelector<HTMLButtonElement>('button')!.disabled).toBe(true);
});
it('calls the default browser fetch without the panel as its receiver',async()=>{
 const fetcher=vi.spyOn(globalThis,'fetch').mockImplementation(async function(this:unknown){
  if(this!==undefined&&this!==globalThis)throw new TypeError('Illegal invocation');
  return new Response(JSON.stringify(page));
 });
 panel=new DiscoveryPanel(['bob'],vi.fn());panel.setAuth(auth);
 panel.root.querySelector<HTMLButtonElement>('button')!.click();await flush();
 expect(fetcher).toHaveBeenCalledTimes(1);
 expect(panel.root.querySelector('[role="status"]')?.textContent).toBe('Loaded one page');
 expect(panel.root.textContent).toContain('Live title');
});
it('validates bounded pages, account IDs and plain text while discarding private fields',()=>{expect(parseDiscovery({...page,token:'secret'}).items[0]?.login).toBe('alice');expect(JSON.stringify(parseDiscovery({...page,token:'secret'}))).not.toContain('secret');for(const bad of [{...page,items:Array(101).fill(page.items[0])},{...page,after:'\n'},{...page,items:[{...page.items[0],login:'<script>'}]}])expect(()=>parseDiscovery(bad)).toThrow();});
it('loads only on an explicit click, filters one page, joins through the workspace callback and replaces paginated rows',async()=>{const join=vi.fn(),fetcher=vi.fn(async(_input:RequestInfo|URL,_init?:RequestInit)=>new Response(JSON.stringify(page)));document.body.innerHTML='<button id="workspace-open"></button>';panel=new DiscoveryPanel(['bob'],join,fetcher);panel.setAuth(auth);expect(fetcher).not.toHaveBeenCalled();panel.root.querySelector<HTMLButtonElement>('button')!.click();await flush();expect(fetcher).toHaveBeenCalledTimes(1);expect(panel.root.textContent).toContain('Live title');[...panel.root.querySelectorAll('button')].find(b=>b.textContent==='Join workspace')!.click();expect(join).toHaveBeenCalledWith('alice');const search=panel.root.querySelector<HTMLInputElement>('input')!;search.value='absent';search.dispatchEvent(new Event('input'));expect(panel.root.textContent).toContain('No matches on this page');search.value='';search.dispatchEvent(new Event('input'));[...panel.root.querySelectorAll('button')].find(b=>b.textContent==='Next page')!.click();await flush();expect(String(fetcher.mock.calls[1]?.[0])).toContain('after=next');expect(panel.root.querySelector('section')?.querySelectorAll('p')).toHaveLength(1);expect(panel.root.textContent).toContain('Page 2');});
it('clears account data and aborts a pending page on account change or privacy; stale results cannot return',async()=>{let resolve:((r:Response)=>void)|undefined;const fetcher=vi.fn(()=>new Promise<Response>(r=>{resolve=r;}));panel=new DiscoveryPanel(['alice'],vi.fn(),fetcher);panel.setAuth(auth);panel.root.querySelector<HTMLButtonElement>('button')!.click();panel.setAuth({...auth,userID:'43',login:'other'});resolve!(new Response(JSON.stringify(page)));await flush();expect(panel.root.textContent).not.toContain('Live title');expect(panel.root.querySelector('section')?.childNodes).toHaveLength(0);localStorage.setItem('chatthing:v1:privacy',JSON.stringify({version:1,enabled:true,panic:true,allowed:[]}));document.dispatchEvent(new Event('privacychange'));expect(panel.root.querySelector<HTMLButtonElement>('button')!.disabled).toBe(true);});
it('discloses optional consent and role rejection, and honors a rate-limit retry without extra requests',async()=>{const fetcher=vi.fn(async()=>new Response('',{status:429,headers:{'Retry-After':'300'}}));panel=new DiscoveryPanel(['alice'],vi.fn(),fetcher);panel.setAuth({...auth,followsEnabled:false});expect(panel.root.querySelector<HTMLAnchorElement>('a')?.href).toContain('discovery=follows');expect(panel.root.querySelector<HTMLButtonElement>('button')!.disabled).toBe(true);panel.setAuth(auth);panel.root.querySelector<HTMLButtonElement>('button')!.click();await flush();expect(panel.root.textContent).toContain('Rate limited');panel.root.querySelector<HTMLButtonElement>('button')!.click();expect(fetcher).toHaveBeenCalledTimes(1);});
