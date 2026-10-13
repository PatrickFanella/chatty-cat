import {getProfileScope,profileKey} from './account-profiles';
export interface CompletionPreferences {version:1;mode:'prefix'|'fuzzy';bareNames:boolean;appendSpace:boolean;mentionAt:boolean;mentionComma:boolean;spellcheck:boolean;smartEmotes:boolean;emoteWithColon:boolean;usernameMenu:boolean;includeBroadcaster:boolean;fetchChatters:boolean;onlySmall:boolean;viewerLimit:number;aliases:{login:string;alias:string}[];emotePriority:string[]}
export const completionDefaults:CompletionPreferences={version:1,mode:'prefix',bareNames:false,appendSpace:true,mentionAt:true,mentionComma:false,spellcheck:false,smartEmotes:true,emoteWithColon:true,usernameMenu:true,includeBroadcaster:false,fetchChatters:false,onlySmall:true,viewerLimit:1000,aliases:[],emotePriority:[]};
function record(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
export function parseCompletionPreferences(value:unknown):CompletionPreferences{
 if(value===null||value===undefined)return {...completionDefaults,aliases:[],emotePriority:[]};
 if(!record(value)||value.version!==1||!['prefix','fuzzy'].includes(String(value.mode)))throw new Error('Unsupported completion preferences');
 const result:CompletionPreferences={...completionDefaults,mode:value.mode==='fuzzy'?'fuzzy':'prefix',aliases:[],emotePriority:[]};
 for(const key of ['bareNames','appendSpace','mentionAt','mentionComma','spellcheck','smartEmotes','emoteWithColon','usernameMenu','includeBroadcaster','fetchChatters','onlySmall'] as const){if(value[key]===undefined)continue;if(typeof value[key]!=='boolean')throw new Error('Completion options must be boolean');result[key]=value[key];}
 if(value.viewerLimit!==undefined){if(typeof value.viewerLimit!=='number'||!Number.isInteger(value.viewerLimit)||value.viewerLimit<1||value.viewerLimit>100000)throw new Error('Viewer threshold must be 1–100,000');result.viewerLimit=value.viewerLimit;}
 if(!Array.isArray(value.aliases)||value.aliases.length>100)throw new Error('Keep at most 100 local nicknames');
 for(const item of value.aliases){if(!record(item)||typeof item.login!=='string'||!/^\w{1,25}$/.test(item.login)||typeof item.alias!=='string'||!item.alias.trim()||item.alias.length>40||/[\x00-\x1f\x7f-\x9f]/.test(item.alias))throw new Error('Invalid local nickname');result.aliases.push({login:item.login.toLowerCase(),alias:item.alias.trim()});}
 if(new Set(result.aliases.map(x=>x.login)).size!==result.aliases.length)throw new Error('Duplicate local nickname logins');
 if(!Array.isArray(value.emotePriority)||value.emotePriority.length>64||value.emotePriority.some(x=>typeof x!=='string'||!x||x.length>80||/[\s\x00-\x1f\x7f-\x9f]/.test(x)))throw new Error('Choose at most 64 exact emote codes');
 for(const item of value.emotePriority)if(typeof item==='string')result.emotePriority.push(item);
 if(new Set(result.emotePriority.map(x=>x.toLowerCase())).size!==result.emotePriority.length)throw new Error('Duplicate emote priority codes');return result;
}
let current=parseCompletionPreferences(null),aliases=new Map<string,string>();
export function getCompletionPreferences():CompletionPreferences{return current;}
export function setCompletionPreferences(value:CompletionPreferences):void{current=parseCompletionPreferences(value);aliases=new Map(current.aliases.map(x=>[x.login,x.alias]));}
export function getLocalNickname(login:string):string|undefined{return aliases.get(login.toLowerCase());}
export class CompletionPreferenceStore {
 private account=getProfileScope();private key=profileKey('chatthing:v1:completion-preferences');private raw:string|null;
 constructor(){this.raw=localStorage.getItem(this.key);this.read();}
 read():CompletionPreferences{if(getProfileScope()!==this.account)throw new Error('Account changed; reopen completion preferences');if(this.raw&&new TextEncoder().encode(this.raw).length>32768)throw new Error('Saved completion preferences exceed 32 KB');return parseCompletionPreferences(this.raw?JSON.parse(this.raw):null);}
 save(value:CompletionPreferences):void{if(getProfileScope()!==this.account)throw new Error('Account changed; reopen completion preferences');if(localStorage.getItem(this.key)!==this.raw)throw new Error('Completion preferences changed in another tab; reopen before saving');const safe=parseCompletionPreferences(value),raw=JSON.stringify(safe);if(new TextEncoder().encode(raw).length>32768)throw new Error('Completion preferences exceed 32 KB');localStorage.setItem(this.key,raw);this.raw=raw;}
}
