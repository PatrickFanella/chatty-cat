import type {ChatMessage} from './protocol';
import type {Emote} from './tokens';
import {tokenize} from './tokens';
import {findLinks} from './links';
export type StatKind='users'|'emotes'|'badges'|'links';
interface Counter {total:number;hours:Map<number,number>;days:Map<number,number>}
export interface LedgerRank {name:string;count:number}
const KINDS:StatKind[]=['users','emotes','badges','links'];
const MAX=20000,MAX_BUCKETS=200000;
const HIDDEN_LINKS=new Set(['twitch.amazon.com/tp','linktr.ee/fearand','twitter.com/fearandpod']);
export class StatsLedger {
 private data=new Map<string,Counter>();
 private seen=new Set<string>();
 private pending=new Map<string,{message:ChatMessage|undefined;at:number;counted:string[]}>();
 private storageKey:string;
 private initialized=false;
 private bucketCount=0;
 since=Date.now();
 limited=false;
 storageFailed=false;
 constructor(private channels:readonly string[],private emotes:(channel:string)=>Record<string,Emote>){
  this.storageKey='chatthing:v1:stats:counts:'+channels.join(',');
  try {const raw=localStorage.getItem(this.storageKey);if(raw){if(raw.length>6000000)this.storageFailed=true;else this.restore(JSON.parse(raw));}}catch{this.storageFailed=true;}
 }
 bootstrap(messages:readonly ChatMessage[]):void {for(const message of messages){this.attach(message);if(this.initialized){if(message.id)this.remember(message.channel+':'+message.id);}else this.observe(message,message.timestamp);}this.initialized=true;}
 attach(message:ChatMessage):void {const pending=this.pending.get(message.channel+':'+message.id);if(pending)pending.message=message;}
 private remember(key:string):void {this.seen.add(key);while(this.seen.size>100000){const oldest=this.seen.values().next().value;if(oldest)this.seen.delete(oldest);else break;}}
 private increment(channel:string,kind:StatKind,name:string,hour:number,day:number):void {if(!name||name.length>2048)return;const key=JSON.stringify([channel,kind,name]);let count=this.data.get(key);if(!count){if(this.data.size>=MAX){this.limited=true;return;}count={total:0,hours:new Map(),days:new Map()};this.data.set(key,count);}count.total=Math.min(Number.MAX_SAFE_INTEGER,count.total+1);for(const [map,index] of [[count.hours,hour],[count.days,day]] as const){if(!map.has(index)){if(this.bucketCount>=MAX_BUCKETS){this.limited=true;continue;}this.bucketCount++;}map.set(index,Math.min(Number.MAX_SAFE_INTEGER,(map.get(index)??0)+1));}}
 observe(message:ChatMessage,now=Date.now()):void {
  if(message.command!=='PRIVMSG'||!this.channels.includes(message.channel)||!Number.isSafeInteger(now)||now<0||! /^[a-z0-9_]{1,25}$/i.test(message.login))return;
  const id=message.channel+':'+message.id;if(message.id&&this.seen.has(id))return;if(message.id&&id.length<=256)this.remember(id);
  this.since=Math.min(this.since,now);const hour=Math.floor(now/3600000),day=Math.floor(now/86400000);
  const add=(kind:StatKind,name:string)=>this.increment(message.channel,kind,name,hour,day);
  add('users',message.login.toLowerCase());
  const catalog=this.emotes(message.channel),counted:string[]=[];for(const token of tokenize(message.text,message.tags.emotes??'',catalog,false,/^[1-9][0-9]*$/.test(message.tags.bits??'')))if(token.type==='emote'){add('emotes',token.emote.code);counted.push(token.emote.code);}
  if(!Object.keys(catalog).length){if(this.pending.size<100000)this.pending.set(id,{message,at:now,counted});else this.limited=true;}
  for(const badge of new Set((message.tags.badges??'').split(',').filter(value=>/^[\w-]+\/[\w-]+$/.test(value))))add('badges',badge);
  for(const url of new Set(findLinks(message.text).map(link=>{const url=new URL(link.href);url.hostname=url.hostname.replace(/^(?:www|mobile)\./,'');return url.href;})))add('links',url);
 }
 reconcile(channel:string):void {const catalog=this.emotes(channel);if(!Object.keys(catalog).length)return;for(const [key,pending] of this.pending){if(!pending.message||pending.message.channel!==channel)continue;const counted=[...pending.counted];for(const token of tokenize(pending.message.text,pending.message.tags.emotes??'',catalog,false,/^[1-9][0-9]*$/.test(pending.message.tags.bits??'')))if(token.type==='emote'){const index=counted.indexOf(token.emote.code);if(index>=0)counted.splice(index,1);else this.increment(channel,'emotes',token.emote.code,Math.floor(pending.at/3600000),Math.floor(pending.at/86400000));}this.pending.delete(key);}}
 ranks(kind:StatKind,hours:number,channel='',excluded:ReadonlySet<string>=new Set(),now=Date.now(),limit=50):LedgerRank[]{
  const totals=new Map<string,number>(),from=Math.floor(now/3600000)-hours+1;
  for(const [key,value] of this.data){const [scope,type,name]=JSON.parse(key) as [string,StatKind,string];if(type!==kind||channel&&scope!==channel||kind==='users'&&excluded.has(name))continue;if(kind==='links'){const url=new URL(name);if(HIDDEN_LINKS.has(url.hostname+url.pathname.replace(/\/$/,'')))continue;}
   let count=hours===0?value.total:0;if(hours)for(const [hour,total] of value.hours)if(hour>=from&&hour<=Math.floor(now/3600000))count+=total;if(count)totals.set(name,Math.min(Number.MAX_SAFE_INTEGER,(totals.get(name)??0)+count));
  }
  return [...totals].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name)).slice(0,Number.isFinite(limit)?Math.max(0,Math.min(MAX,Math.floor(limit))):50);
 }
 buckets(unit:'hours'|'days',channel='',excluded:ReadonlySet<string>=new Set(),now=Date.now()):{at:number;count:number}[]{
  const duration=unit==='hours'?3600000:86400000,last=Math.floor(now/duration),first=last-(unit==='hours'?167:30),totals=new Map<number,number>();
  for(const [key,value] of this.data){const [scope,kind,name]=JSON.parse(key) as [string,StatKind,string];if(kind!=='users'||channel&&scope!==channel||excluded.has(name))continue;for(const [index,count] of value[unit])if(index>=first&&index<=last)totals.set(index,Math.min(Number.MAX_SAFE_INTEGER,(totals.get(index)??0)+count));}
  return [...totals].sort(([a],[b])=>a-b).map(([index,count])=>({at:index*duration,count}));
 }
 prune(now=Date.now()):void {const hour=Math.floor(now/3600000)-168,day=Math.floor(now/86400000)-31;for(const value of this.data.values())for(const [map,from] of [[value.hours,hour],[value.days,day]] as const)for(const index of map.keys())if(index<from){map.delete(index);this.bucketCount--;}}
 snapshot(now=Date.now()):unknown {this.prune(now);return {version:1,since:this.since,limited:this.limited,seen:[...this.seen],pending:[...this.pending].map(([key,value])=>[key,value.at,value.counted]),rows:[...this.data].map(([key,value])=>[JSON.parse(key),value.total,[...value.hours],[...value.days]])};}
 restore(value:unknown,now=Date.now()):void {
  if(!value||typeof value!=='object')return;const data=value as Record<string,unknown>;if(data.version!==1||!Array.isArray(data.rows)||data.rows.length>MAX||typeof data.since!=='number'||!Number.isSafeInteger(data.since)||data.since<0||data.since>now)return;
  if(data.seen!==undefined&&(!Array.isArray(data.seen)||data.seen.length>100000||!data.seen.every((key:unknown)=>typeof key==='string'&&key.length<=256&&this.channels.some(channel=>key.startsWith(channel+':')))))return;
  const restored=new Map<string,Counter>();let buckets=0;
  for(const raw of data.rows){if(!Array.isArray(raw)||raw.length!==4||!Array.isArray(raw[0])||raw[0].length!==3||!raw[0].every((v:unknown)=>typeof v==='string')||!this.channels.includes(raw[0][0]!)||!KINDS.some(kind=>kind===raw[0][1])||!raw[0][2]||raw[0][2].length>2048||!Number.isSafeInteger(raw[1])||raw[1]<0||!Array.isArray(raw[2])||raw[2].length>170||!Array.isArray(raw[3])||raw[3].length>33)return;
   if(raw[0][1]==='links'){try{const url=new URL(raw[0][2]);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return;}catch{return;}}
   const maps:Map<number,number>[]=[];for(const rows of [raw[2],raw[3]]){const map=new Map<number,number>();for(const entry of rows){if(!Array.isArray(entry)||entry.length!==2||!entry.every(Number.isSafeInteger)||entry[0]<0||entry[1]<0||entry[1]>raw[1])return;if(map.has(entry[0]))return;map.set(entry[0],entry[1]);}buckets+=map.size;maps.push(map);}if(buckets>MAX_BUCKETS)return;
   if(restored.has(JSON.stringify(raw[0])))return;
   restored.set(JSON.stringify(raw[0]),{total:raw[1],hours:maps[0]!,days:maps[1]!});
  }
  const pending=new Map<string,{message:ChatMessage|undefined;at:number;counted:string[]}>();
  if(data.pending!==undefined){if(!Array.isArray(data.pending)||data.pending.length>100000)return;for(const raw of data.pending){if(!Array.isArray(raw)||raw.length!==3||typeof raw[0]!=='string'||raw[0].length>300||!this.channels.some(channel=>raw[0].startsWith(channel+':'))||!Number.isSafeInteger(raw[1])||raw[1]<0||raw[1]>now+5000||!Array.isArray(raw[2])||raw[2].length>500||!raw[2].every((code:unknown)=>typeof code==='string'&&code.length<=100))return;pending.set(raw[0],{message:undefined,at:raw[1],counted:raw[2]});}}
  this.pending=pending;this.data=restored;this.seen=new Set(Array.isArray(data.seen)?data.seen:[]);this.bucketCount=buckets;this.since=data.since;this.limited=data.limited===true;this.initialized=true;this.prune(now);
 }
 save():void {try {const value=JSON.stringify(this.snapshot());if(value.length>6000000){this.storageFailed=true;return;}localStorage.setItem(this.storageKey,value);this.storageFailed=false;}catch{this.storageFailed=true;}}
}
