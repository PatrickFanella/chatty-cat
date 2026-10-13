// @vitest-environment happy-dom
import {afterEach,expect,it,vi} from 'vitest';
import {parseCosmetics,CosmeticClient,cosmeticBadges} from './cosmetics';
import {providerDefaults,setProviderPreferences} from './provider-preferences';
import {messageRow} from './render';
let client:CosmeticClient|undefined;
afterEach(()=>{client?.stop();vi.unstubAllGlobals();vi.useRealTimers();setProviderPreferences(providerDefaults());});
const badge={provider:'FFZ',title:'Developer',url:'https://cdn.frankerfacez.com/badge.png'};
it('accepts only bounded, attributed, requested public assignments',()=>{expect(parseCosmetics({providers:['FFZ'],badges:{'42':[badge]},errors:[]},['42'])?.badges['42']).toEqual([badge]);for(const value of [{providers:['FFZ'],badges:{'43':[badge]},errors:[]},{providers:['FFZ'],badges:{'42':[{...badge,url:'javascript:bad'}]},errors:[]},{providers:['FFZ'],badges:{'42':Array(17).fill(badge)},errors:[]}])expect(parseCosmetics(value,['42'])).toBeNull();});
it('makes no catalog request until opted in, labels cosmetics without altering native role tags, and cancels late responses',async()=>{
 const fetcher=vi.fn(async(url:string)=>url.includes('/config')?new Response(JSON.stringify({providers:['FFZ']})):new Response(JSON.stringify({providers:['FFZ'],badges:{'42':[badge]},errors:[]})));vi.stubGlobal('fetch',fetcher);const changed=vi.fn();client=new CosmeticClient(()=>['42'],changed,()=>{});await client.refresh();expect(fetcher).not.toHaveBeenCalled();const p=providerDefaults();p.cosmetics.FFZ=true;setProviderPreferences(p);await client.refresh();expect(cosmeticBadges('42')).toEqual([badge]);const row=messageRow({id:'x',command:'PRIVMSG',channel:'room',login:'alice',text:'hi',timestamp:1,tags:{'user-id':'42',badges:'moderator/1'}});expect(row.querySelector('.cosmetic-badge')?.getAttribute('alt')).toBe('[FFZ cosmetic: Developer]');expect(row.querySelector('.badges')?.textContent).toContain('[moderator]');
 let finish:(r:Response)=>void=()=>{};vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(resolve=>{finish=resolve;})));vi.setSystemTime(Date.now()+61000);const pending=client.refresh();client.stop();finish(new Response(JSON.stringify({providers:['FFZ'],badges:{'42':[badge]},errors:[]})));await pending;expect(cosmeticBadges('42')).toEqual([]);
});
