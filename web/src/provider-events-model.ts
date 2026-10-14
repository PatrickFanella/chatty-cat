import type {ChannelMetadata} from './metadata';
import type {ProviderPreferences} from './provider-preferences';
import type {CosmeticBadge} from './cosmetics';

export type LiveProvider='BTTV'|'7TV';
export const LIVE_PROVIDERS:readonly LiveProvider[]=['BTTV','7TV'];
export function record(v:unknown):v is Record<string,unknown>{return !!v&&typeof v==='object'&&!Array.isArray(v);}
const id=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v);
const twitchID=(v:unknown):v is string=>typeof v==='string'&&/^[0-9]{1,32}$/.test(v);
export function parseProviderCapabilities(v:unknown):LiveProvider[]|null{
 if(!record(v)||Object.keys(v).some(k=>!['providers','maxChannels','maxSockets','refreshSeconds'].includes(k))||v.maxChannels!==24||v.maxSockets!==3||v.refreshSeconds!==30||!Array.isArray(v.providers)||v.providers.length>2||new Set(v.providers).size!==v.providers.length||!v.providers.every((p):p is LiveProvider=>p==='BTTV'||p==='7TV'))return null;
 return v.providers;
}
export interface Subscription {type:string;condition:Record<string,string>}
export function providerEventPlan(metadata:readonly ChannelMetadata[],p:ProviderPreferences,allowed:readonly LiveProvider[]):{bttv:string[];sevenTV:Subscription[]}{
 const rooms=metadata.slice(0,24),subscriptions=new Map<string,Subscription>();
 const add=(type:string,condition:Record<string,string>):void=>{const s={type,condition};subscriptions.set(JSON.stringify(s),s);};
 const bttv=allowed.includes('BTTV')&&p.cosmetics.BTTV?[...new Set(rooms.map(m=>m.broadcasterID).filter(twitchID))]:[];
 if(allowed.includes('7TV')&&p.sevenTVEventAPI){for(const room of rooms){
  const seven=room.sevenTV,options=p.providers['7TV'];
  if(options.live){if(options.global&&id(seven?.globalSetID))add('emote_set.update',{object_id:seven.globalSetID});if(options.channel){if(id(seven?.channelSetID))add('emote_set.update',{object_id:seven.channelSetID});if(id(seven?.userID))add('user.update',{object_id:seven.userID});}}
  if(p.cosmetics['7TV']&&twitchID(room.broadcasterID))for(const type of ['cosmetic.create','entitlement.create','entitlement.delete'])add(type,{ctx:'channel',platform:'TWITCH',id:room.broadcasterID});
 }}
 return {bttv,sevenTV:[...subscriptions.values()]};
}
export function refreshTargets(provider:LiveProvider,v:unknown,metadata:readonly ChannelMetadata[],p:ProviderPreferences):string[]{
 if(!p.providers[provider].live)return [];
 const rooms=metadata.slice(0,24);
 if(provider==='BTTV'){
  if(!record(v)||!['emote_create','emote_update','emote_delete'].includes(String(v.name))||!record(v.data)||typeof v.data.channel!=='string'||!p.providers.BTTV.channel)return [];
  const channel=v.data.channel;return rooms.filter(m=>m.broadcasterID&&channel==='twitch:'+m.broadcasterID).map(m=>m.channel);
 }
 if(!p.sevenTVEventAPI||!record(v)||v.op!==0||!record(v.d)||!record(v.d.body)||!id(v.d.body.id))return [];
 const objectID=v.d.body.id,type=v.d.type,options=p.providers['7TV'];
 return rooms.filter(m=>type==='emote_set.update'&&(options.global&&m.sevenTV?.globalSetID===objectID||options.channel&&m.sevenTV?.channelSetID===objectID)||type==='user.update'&&options.channel&&m.sevenTV?.userID===objectID).map(m=>m.channel);
}

interface Assignment {refs:Map<string,number>;bttv?:{badge:CosmeticBadge;at:number}}
const TTL=15*60*1000;
function safeImage(value:unknown,host:string):string|null{
 if(typeof value!=='string'||value.length>2048||/[\x00-\x20\x7f]/.test(value))return null;
 try{const u=new URL(value.startsWith('//')?'https:'+value:value);if(u.protocol!=='https:'||u.hostname!==host||u.port||u.username||u.password||u.search||u.hash)return null;return u.href;}catch{return null;}
}
function sevenBadge(v:unknown):{id:string;badge:CosmeticBadge}|null{
 if(!record(v)||!id(v.id)||!record(v.host)||!Array.isArray(v.host.files)||v.host.files.length>32)return null;
 const host=safeImage(v.host.url,'cdn.7tv.app');if(!host||new URL(host).pathname.replace(/\/$/,'')!=='/badge/'+v.id)return null;
 const names=v.host.files.filter(record).map(f=>f.name).filter((n):n is string=>typeof n==='string'&&/^[12]x\.(webp|png|gif|avif)$/.test(n));
 const name=names.find(n=>n.startsWith('2x.'))??names[0];const title=v.tooltip??v.name;
 if(!name||typeof title!=='string'||!title.trim()||title.length>200||/[\x00-\x1f\x7f]/.test(title))return null;
 return {id:v.id,badge:{provider:'7TV',url:host.replace(/\/$/,'')+'/'+name,title}};
}
// Public cosmetic assignments never modify native Twitch badge tags or roles.
export class ProviderBadges {
 private definitions=new Map<string,{badge:CosmeticBadge;at:number}>();
 private users=new Map<string,Assignment>();
 clear():void{this.definitions.clear();this.users.clear();}
 sizes():{definitions:number;users:number}{return {definitions:this.definitions.size,users:this.users.size};}
 prune(now:number):boolean{
  let changed=false;for(const [key,row] of this.definitions)if(now-row.at>=TTL){this.definitions.delete(key);changed=true;}
  for(const [key,row] of this.users){for(const [ref,at] of row.refs)if(now-at>=TTL){row.refs.delete(ref);changed=true;}if(row.bttv&&now-row.bttv.at>=TTL){delete row.bttv;changed=true;}if(!row.refs.size&&!row.bttv)this.users.delete(key);}
  return changed;
 }
 forUser(provider:LiveProvider,user:string,now=Date.now()):CosmeticBadge[]{
  const row=this.users.get(user);if(!row)return [];
  if(provider==='BTTV')return row.bttv&&now-row.bttv.at<TTL?[row.bttv.badge]:[];
  return [...row.refs].flatMap(([ref,at])=>{const def=this.definitions.get(ref);return now-at<TTL&&def&&now-def.at<TTL?[def.badge]:[];});
 }
 private user(id:string):Assignment{let row=this.users.get(id);if(!row)row={refs:new Map()};this.users.delete(id);this.users.set(id,row);while(this.users.size>256)this.users.delete(this.users.keys().next().value!);return row;}
 accept(provider:LiveProvider,v:unknown,now=Date.now()):boolean{
  if(!record(v))return false;
  if(provider==='BTTV'){
   if(v.name!=='lookup_user'||!record(v.data)||!twitchID(v.data.providerId)||!('badge' in v.data))return false;
   if(v.data.badge===null){const row=this.users.get(v.data.providerId);if(!row?.bttv)return false;delete row.bttv;return true;}
   if(!record(v.data.badge))return false;const url=safeImage(v.data.badge.url,'cdn.betterttv.net');if(!url)return false;
   this.user(v.data.providerId).bttv={badge:{provider:'BTTV',url,title:'BTTV Pro'},at:now};return true;
  }
  if(v.op!==0||!record(v.d)||!record(v.d.body)||!record(v.d.body.object))return false;
  const object=v.d.body.object;if(object.kind!=='BADGE')return false;
  if(v.d.type==='cosmetic.create'){
   const def=sevenBadge(object.data);if(!def)return false;this.definitions.delete(def.id);this.definitions.set(def.id,{badge:def.badge,at:now});while(this.definitions.size>128)this.definitions.delete(this.definitions.keys().next().value!);return true;
  }
  if(!['entitlement.create','entitlement.delete'].includes(String(v.d.type))||!id(object.ref_id)||!record(object.user)||!Array.isArray(object.user.connections)||object.user.connections.length>16)return false;
  let changed=false;for(const connection of object.user.connections){if(!record(connection)||connection.platform!=='TWITCH'||!twitchID(connection.id))continue;
   if(v.d.type==='entitlement.delete'){const row=this.users.get(connection.id);changed=!!row?.refs.delete(object.ref_id)||changed;}
   else{const row=this.user(connection.id);row.refs.delete(object.ref_id);row.refs.set(object.ref_id,now);while(row.refs.size>8)row.refs.delete(row.refs.keys().next().value!);changed=true;}
  }return changed;
 }
}
