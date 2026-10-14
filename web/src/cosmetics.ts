import {getProviderPreferences} from './provider-preferences';
import {privacyEnabled} from './privacy';
export const COSMETIC_PROVIDERS=['FFZ','Chatterino'] as const;
type StaticCosmeticProvider=typeof COSMETIC_PROVIDERS[number];
export type CosmeticProvider=StaticCosmeticProvider|'BTTV'|'7TV';
export interface CosmeticBadge {provider:CosmeticProvider;url:string;title:string}
interface CosmeticResult {providers:StaticCosmeticProvider[];badges:Record<string,CosmeticBadge[]>;errors:string[]}
function record(v:unknown):v is Record<string,unknown>{return !!v&&typeof v==='object'&&!Array.isArray(v);}
function provider(v:unknown):v is StaticCosmeticProvider{return v==='FFZ'||v==='Chatterino';}
export function parseCosmetics(v:unknown,requested:readonly string[]):CosmeticResult|null{
 if(!record(v)||!Array.isArray(v.providers)||v.providers.length>2||!v.providers.every(provider)||new Set(v.providers).size!==v.providers.length||!record(v.badges)||Object.keys(v.badges).length>100||!Array.isArray(v.errors)||v.errors.length>2||!v.errors.every((s:unknown)=>typeof s==='string'&&s.length<=200))return null;
 const badges:Record<string,CosmeticBadge[]>=Object.create(null) as Record<string,CosmeticBadge[]>;
 for(const [id,list] of Object.entries(v.badges)){
  if(!/^[0-9]{1,32}$/.test(id)||!requested.includes(id)||!Array.isArray(list)||list.length>16)return null;
  const parsed:CosmeticBadge[]=[];
  for(const b of list){if(!record(b)||!provider(b.provider)||!v.providers.includes(b.provider)||typeof b.title!=='string'||!b.title||b.title.length>200||typeof b.url!=='string'||b.url.length>2048||/[\x00-\x20\x7f]/.test(b.url))return null;try{const url=new URL(b.url);if(url.protocol!=='https:'||url.username||url.password)return null;}catch{return null;}parsed.push({provider:b.provider,url:b.url,title:b.title});}
  badges[id]=parsed;
 }
 return {providers:v.providers,badges,errors:v.errors};
}
const cache=new Map<string,CosmeticBadge[]>();
const liveLookups=new Map<'BTTV'|'7TV',(id:string)=>CosmeticBadge[]>();
export function setLiveCosmeticLookup(provider:'BTTV'|'7TV',lookup:((id:string)=>CosmeticBadge[])|undefined):void{if(lookup)liveLookups.set(provider,lookup);else liveLookups.delete(provider);}
export function cosmeticBadges(id:string):CosmeticBadge[]{if(privacyEnabled())return [];const p=getProviderPreferences();return [...(cache.get(id)??[]),...Array.from(liveLookups.values()).flatMap(lookup=>lookup(id))].filter(b=>p.cosmetics[b.provider]);}
async function json(response:Response):Promise<unknown>{
 if(!response.ok||Number(response.headers.get('content-length')??0)>4*1024*1024)throw new Error('Cosmetic badges unavailable');const reader=response.body?.getReader();if(!reader)throw new Error('Missing cosmetic data');let size=0;const chunks:Uint8Array[]=[];try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>4*1024*1024)throw new Error('Cosmetic data exceeds limit');chunks.push(value);}}finally{await reader.cancel();}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder().decode(bytes));
}
export class CosmeticClient {
 private timer:ReturnType<typeof setTimeout>|undefined;private abort=new AbortController();private generation=0;private stopped=false;private last=-Infinity;private configured:StaticCosmeticProvider[]|undefined;
 constructor(private users:()=>readonly string[],private changed:()=>void,private available:(providers:readonly CosmeticProvider[],detail:string)=>void){document.addEventListener('privacychange',this.privacy);}
 start():void{this.schedule(1000);}
 private schedule(delay=60000):void{if(!this.stopped){clearTimeout(this.timer);this.timer=setTimeout(()=>{void this.refresh().finally(()=>this.schedule());},delay);}}
 async refresh():Promise<void>{
  const prefs=getProviderPreferences();if(this.stopped||privacyEnabled()||!COSMETIC_PROVIDERS.some(p=>prefs.cosmetics[p])||Date.now()-this.last<60000)return;
  const ids=[...new Set(this.users().filter(id=>/^[0-9]{1,32}$/.test(id)))].slice(0,100);if(!ids.length)return;
  this.last=Date.now();const generation=this.generation,signal=AbortSignal.any([this.abort.signal,AbortSignal.timeout(12000)]);
  try{
   if(!this.configured){const config=await json(await fetch('/api/cosmetics/config',{credentials:'omit',cache:'no-store',signal}));if(!record(config)||!Array.isArray(config.providers)||config.providers.length>2||!config.providers.every(provider))throw new Error('Invalid cosmetic configuration');if(generation!==this.generation||this.stopped||privacyEnabled())return;this.configured=config.providers;this.available(this.configured,this.configured.length?'Server-configured cosmetics: '+this.configured.join(', '):'Cosmetic services are not configured on this server.');}
   if(!this.configured.some(p=>prefs.cosmetics[p]))return;
   const value=await json(await fetch('/api/cosmetics?users='+encodeURIComponent(ids.join(',')),{credentials:'omit',cache:'no-store',signal}));const result=parseCosmetics(value,ids);if(!result)throw new Error('Invalid cosmetic badges');if(generation!==this.generation||this.stopped||privacyEnabled())return;
   for(const id of ids){cache.delete(id);cache.set(id,result.badges[id]??[]);}while(cache.size>256){const first=cache.keys().next().value;if(first!==undefined)cache.delete(first);else break;}this.available(result.providers,result.errors.length?result.errors.join('; '):'Cosmetic metadata updated from configured public catalogs.');this.changed();
  }catch{if(generation===this.generation&&!this.stopped&&!privacyEnabled())this.available(this.configured??[],'Cosmetic metadata unavailable; chat continues. Retry is limited to once per minute.');/* Cosmetic failure never interrupts chat; retry at most once per minute. */}
 }
 preferencesChanged():void{this.generation++;this.abort.abort();this.abort=new AbortController();cache.clear();this.last=-Infinity;this.changed();void this.refresh();}
 private privacy=():void=>{this.generation++;this.abort.abort();this.abort=new AbortController();cache.clear();this.changed();};
 stop():void{this.stopped=true;this.generation++;this.abort.abort();clearTimeout(this.timer);cache.clear();document.removeEventListener('privacychange',this.privacy);}
}
