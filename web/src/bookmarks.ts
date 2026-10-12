import type {ChatMessage} from './protocol';
import {findLinks} from './links';
export const BOOKMARK_LIMIT=200,BOOKMARK_BYTES=1000000;
const PUBLIC=['PRIVMSG','USERNOTICE','NOTICE','CLEARCHAT','CLEARMSG'];
export type BookmarkKind='message'|'conversation';
export interface BookmarkMessage {id:string;command:string;channel:string;login:string;text:string;timestamp:number;parent:string;root:string;target:string;duration:string;deleted:boolean}
export interface Bookmark {id:string;kind:BookmarkKind;message:BookmarkMessage;context:BookmarkMessage[];note:string;tags:string[];created:number;updated:number}
export interface BookmarkShare {message:boolean;author:boolean;time:boolean;context:boolean;note:boolean;links:boolean;mentions:boolean;channel:boolean}
function object(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
function plain(value:unknown,max:number):value is string{return typeof value==='string'&&value.length<=max&&!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value);}
function identifier(value:unknown):value is string{return typeof value==='string'&&value.length<=200&&!/[\x00-\x20\x7f]/.test(value);}
function time(value:unknown):value is number{return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=8640000000000000;}
function snapshot(value:unknown):BookmarkMessage {
 if(!object(value)||!identifier(value.id)||typeof value.command!=='string'||!PUBLIC.includes(value.command)||typeof value.channel!=='string'||!/^[a-z0-9_]{1,25}$/.test(value.channel)||typeof value.login!=='string'||value.login!==''&&!/^[a-z0-9_]{1,25}$/i.test(value.login)||!plain(value.text,1000)||!time(value.timestamp)||!identifier(value.parent)||!identifier(value.root)||!identifier(value.target)||typeof value.duration!=='string'||!/^\d{0,8}$/.test(value.duration)||typeof value.deleted!=='boolean')throw new Error('Invalid public bookmark excerpt');
 return {id:value.id,command:value.command,channel:value.channel,login:value.login,text:value.text,timestamp:value.timestamp,parent:value.parent,root:value.root,target:value.target,duration:value.duration,deleted:value.deleted};
}
function tags(value:unknown):string[]{if(!Array.isArray(value)||value.length>10||value.some(v=>typeof v!=='string'||!/^\p{L}[\p{L}\p{N}_-]{0,29}$/u.test(v)))throw new Error('Use up to 10 tags: letters, numbers, underscores or dashes; start with a letter');return [...new Set(value.map(v=>v.toLowerCase()))];}
export function bookmarkMessage(message:ChatMessage):BookmarkMessage {
 if(!PUBLIC.includes(message.command))throw new Error('Only public chat messages can be bookmarked');
 return snapshot({id:message.id,command:message.command,channel:message.channel.toLowerCase(),login:message.login,text:(message.text||message.tags['system-msg']||'').replace(/^\x01ACTION |\x01$/g,'').slice(0,1000),timestamp:message.timestamp,parent:message.tags['reply-parent-msg-id']??'',root:message.tags['reply-thread-parent-msg-id']??message.tags['reply-parent-msg-id']??'',target:message.tags['target-msg-id']??'',duration:message.tags['ban-duration']??'',deleted:message.tags.deleted==='true'||message.tags.deleted==='1'||message.command==='CLEARMSG'});
}
export function bookmarkIdentity(message:BookmarkMessage):string{return message.channel+':'+(message.id||JSON.stringify([message.command,message.timestamp,message.login,message.text]));}
export function bookmarkContext(anchor:BookmarkMessage,messages:readonly ChatMessage[],kind:BookmarkKind):BookmarkMessage[] {
 const seen=new Set<string>([bookmarkIdentity(anchor)]),root=anchor.root||anchor.parent||anchor.id;
 const candidates:BookmarkMessage[]=[];
 for(const message of messages){if(message.channel!==anchor.channel||!PUBLIC.includes(message.command))continue;const record=bookmarkMessage(message),key=bookmarkIdentity(record);if(seen.has(key))continue;seen.add(key);
  if(kind==='conversation'&&record.id!==root&&record.parent!==root&&record.root!==root&&record.parent!==anchor.id)continue;
  candidates.push(record);
 }
 candidates.sort((a,b)=>kind==='conversation'&&(a.id===root||b.id===root)?a.id===root?-1:1:Math.abs(a.timestamp-anchor.timestamp)-Math.abs(b.timestamp-anchor.timestamp));
 return candidates.slice(0,5).sort((a,b)=>a.timestamp-b.timestamp);
}
export function recoveredBookmarkMessages(entry:Bookmark):ChatMessage[]{return [entry.message,...entry.context].map(m=>({id:m.id,command:m.command,channel:m.channel,login:m.login,text:m.text,timestamp:m.timestamp,tags:{'bookmark-excerpt':'1',...(m.parent?{'reply-parent-msg-id':m.parent}:{}),...(m.root?{'reply-thread-parent-msg-id':m.root}:{}),...(m.target?{'target-msg-id':m.target}:{}),...(m.duration?{'ban-duration':m.duration}:{}),...(m.deleted?{deleted:'1'}:{})}}));}
export function parseBookmarks(raw:string):Bookmark[] {
 if(raw.length>BOOKMARK_BYTES||new TextEncoder().encode(raw).length>BOOKMARK_BYTES)throw new Error('Bookmark backup exceeds 1 MB');
 let value:unknown;try{value=JSON.parse(raw);}catch{throw new Error('Bookmark backup is not valid JSON');}
 if(!object(value)||value.format!=='chatty-cat-bookmarks'||value.version!==1||!Array.isArray(value.bookmarks)||value.bookmarks.length>BOOKMARK_LIMIT)throw new Error('Use a version 1 Chatty Cat bookmark backup with at most 200 entries');
 const ids=new Set<string>(),keys=new Set<string>();
 return value.bookmarks.map(raw=>{
  if(!object(raw)||typeof raw.id!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(raw.id)||ids.has(raw.id)||!['message','conversation'].includes(String(raw.kind))||!plain(raw.note,2000)||!time(raw.created)||!time(raw.updated)||raw.updated<raw.created||!Array.isArray(raw.context)||raw.context.length>5)throw new Error('Invalid bookmark fields');
  const message=snapshot(raw.message),context=raw.context.map(snapshot);if(context.some(m=>m.channel!==message.channel))throw new Error('Bookmark context must stay in its channel');
  const contextKeys=new Set([bookmarkIdentity(message)]);for(const m of context){const key=bookmarkIdentity(m);if(contextKeys.has(key))throw new Error('Duplicate context excerpt');contextKeys.add(key);}
  const kind:BookmarkKind=raw.kind==='message'?'message':'conversation',key=kind+':'+bookmarkIdentity(message);if(keys.has(key))throw new Error('Duplicate bookmark identity');ids.add(raw.id);keys.add(key);
  return {id:raw.id,kind,message,context,note:raw.note,tags:tags(raw.tags),created:raw.created,updated:raw.updated};
 });
}
function serialized(bookmarks:readonly Bookmark[]):string{return JSON.stringify({format:'chatty-cat-bookmarks',version:1,bookmarks},null,2);}
export class BookmarkStore {
 private account:string|undefined;
 setAccount(account:string|undefined):void{if(account!==undefined&&!/^[A-Za-z0-9_-]{1,80}$/.test(account))throw new Error('Invalid bookmark profile');this.account=account;}
 get key():string|undefined{return this.account===undefined?undefined:'chatthing:v1:bookmarks:'+this.account;}
 list():Bookmark[]{const raw=this.key?localStorage.getItem(this.key):null;return raw?parseBookmarks(raw):[];}
 private persist(entries:Bookmark[]):void{if(!this.key)throw new Error('Wait for login status before saving bookmarks');const raw=serialized(entries);parseBookmarks(raw);localStorage.setItem(this.key,raw);}
 save(message:BookmarkMessage,context:BookmarkMessage[],kind:BookmarkKind,note:string,tagValues:string[],expected?:Bookmark):Bookmark {
  const list=this.list(),current=expected?list.find(b=>b.id===expected.id):list.find(b=>b.kind===kind&&bookmarkIdentity(b.message)===bookmarkIdentity(message));
  if(expected&&(!current||JSON.stringify(current)!==JSON.stringify(expected)))throw new Error('Bookmark changed in another tab; reopen before saving');
  const now=Date.now(),entry:Bookmark={id:current?.id??crypto.randomUUID(),kind,message,context,note,tags:tags(tagValues),created:current?.created??now,updated:Math.max(now,current?.created??0)};
  if(current)list.splice(list.indexOf(current),1,entry);else list.push(entry);this.persist(list);return this.list().find(b=>b.id===entry.id)!;
 }
 remove(id:string):void{this.persist(this.list().filter(b=>b.id!==id));}
 clear():void{if(this.key)localStorage.removeItem(this.key);}
 export():string{return serialized(this.list());}
 import(entries:readonly Bookmark[]):number {
  const incoming=parseBookmarks(serialized(entries)),list=this.list(),before=list.length;
  for(const entry of incoming){if(list.some(b=>b.kind===entry.kind&&bookmarkIdentity(b.message)===bookmarkIdentity(entry.message)))continue;list.push({...entry,id:list.some(b=>b.id===entry.id)?crypto.randomUUID():entry.id});}
  this.persist(list);return list.length-before;
 }
}
export function shareBookmark(entry:Bookmark,options:BookmarkShare):string {
 const redact=(text:string)=>{if(!options.links)for(const link of findLinks(text).reverse())text=text.slice(0,link.index)+'[link removed]'+text.slice(link.index+link.raw.length);return options.mentions?text:text.replace(/@[a-z0-9_]{1,25}/gi,'@[mention removed]');};
 const excerpt=(m:BookmarkMessage)=>[options.time?new Date(m.timestamp).toISOString():'',options.author?m.login:'',redact(m.text)].filter(Boolean).join(' · ');
 return [options.channel?'Channel: https://www.twitch.tv/'+entry.message.channel:'',options.message?excerpt(entry.message):'',...(options.context?entry.context.map(excerpt):[]),options.note?'Note: '+redact(entry.note):''].filter(Boolean).join('\n');
}
