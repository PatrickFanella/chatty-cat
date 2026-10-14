import {sharedContext,messageReward,messageEffect,watchStreak} from './message-context';
import type {ChatMessage} from './protocol';
import {compilePattern} from './rules';
import {findLinks} from './links';

export const archiveFields=['text','sender','channel','badge','emote','domain','is','regex','after','before','source','sourcebadge','reward','streak','effect'] as const;
export type ArchiveField=typeof archiveFields[number];
export interface ArchiveClause {field:ArchiveField;values:readonly string[];negated:boolean}
export interface ArchiveIdentityPolicy{valid:(field:'sender'|'channel',name:string)=>boolean;normalize:(value:string)=>string}
export interface StructuredArchiveQuery {source:string;clauses:readonly ArchiveClause[];matches:(message:ChatMessage)=>boolean}
function field(raw:string):ArchiveField {
 const name=raw==='from'?'sender':raw==='in'?'channel':raw;
 const result=archiveFields.find(value=>value===name);
 if(!result)throw new Error('Unknown filter "'+raw+'"; choose '+archiveFields.join(', '));
 return result;
}
function split(raw:string,separator:'space'|'comma'):string[] {
 const parts:string[]=[];let start=0,quoted=false,escaped=false;
 for(let i=0;i<raw.length;i++){
  const c=raw[i]!;
  if(escaped){escaped=false;continue;}
  if(c==='\\'&&quoted){escaped=true;continue;}
  if(c==='"'){quoted=!quoted;continue;}
  if(!quoted&&(separator==='comma'?c===',':/\s/.test(c))){if(i>start||separator==='comma')parts.push(raw.slice(start,i));start=i+1;}
 }
 if(quoted||escaped)throw new Error('Close the quoted value; escape quotes with \\"');
 if(start<raw.length||separator==='comma')parts.push(raw.slice(start));
 return parts;
}
function value(raw:string):string {
 let result=raw;
 if(raw.startsWith('"')){try{const parsed:unknown=JSON.parse(raw);if(typeof parsed!=='string')throw new Error();result=parsed;}catch{throw new Error('Invalid quoted value; use double quotes and escape embedded quotes');}}
 else if(raw.includes('"'))throw new Error('Quote the complete filter value');
 if(!result.trim()||result.length>500||/[\x00-\x1f\x7f]/.test(result))throw new Error('Use a non-empty value of at most 500 characters');
 return result;
}
function timestamp(raw:string):number {
 if(!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(raw))throw new Error('Use YYYY-MM-DD (UTC midnight) or an ISO timestamp with Z/time-zone offset');
 const day=raw.slice(0,10),dayValue=Date.parse(day+'T00:00:00Z'),result=Date.parse(raw.length===10?raw+'T00:00:00Z':raw);
 if(!Number.isFinite(result)||result<0||!Number.isFinite(dayValue)||new Date(dayValue).toISOString().slice(0,10)!==day)throw new Error('Choose a valid date from 1970 onward');
 return result;
}
function compile(clause:ArchiveClause,identity?:ArchiveIdentityPolicy):(m:ChatMessage)=>boolean {
 const {field,values}=clause;
 const checks=values.map(raw=>{
  const needle=raw.toLowerCase();
  switch(field){
   case 'text':return (m:ChatMessage)=>(m.text+' '+(m.tags['system-msg']??'')).toLowerCase().includes(needle);
   case 'regex':{const match=compilePattern(raw,true,false);return (m:ChatMessage)=>match(m.text+(m.tags['system-msg']?' '+m.tags['system-msg']:''));}
   case 'sender':case 'channel':{
    const name=identity?identity.normalize(raw):needle.replace(/^[#@]/,'');if(identity?!identity.valid(field,name):!/^[a-z0-9_]{1,25}$/.test(name))throw new Error(identity?'Invalid '+field+' identity':'Use a Twitch login for '+field);
    return (m:ChatMessage)=>(identity?identity.normalize(field==='sender'?m.login:m.channel):(field==='sender'?m.login:m.channel).toLowerCase())===name;
   }
   case 'badge':{
    if(!/^[a-z0-9_-]{1,80}$/.test(needle))throw new Error('Use a badge name, for example subscriber or moderator');
    return (m:ChatMessage)=>(m.tags.badges??'').split(',').some(v=>v.split('/')[0]?.toLowerCase()===needle);
   }
   case 'source':if(!/^[0-9]{1,32}$/.test(raw))throw new Error('Use a supplied origin room ID');return (m:ChatMessage)=>sharedContext(m)?.roomID===raw;
   case 'sourcebadge':if(!/^[a-z0-9_-]{1,100}$/.test(needle))throw new Error('Use an origin badge set name');return (m:ChatMessage)=>sharedContext(m)?.badges?.some(b=>b.set.toLowerCase()===needle)??false;
   case 'reward':return (m:ChatMessage)=>messageReward(m)?.toLowerCase()===needle;
   case 'effect':return (m:ChatMessage)=>messageEffect(m)?.toLowerCase()===needle;
   case 'streak':if(!/^[0-9]{1,7}$/.test(raw)||Number(raw)<1||Number(raw)>1000000)throw new Error('Use a supplied streak count from 1 to 1000000');return (m:ChatMessage)=>watchStreak(m)?.count===Number(raw);
   case 'emote':return (m:ChatMessage)=>(m.tags.emotes??'').split('/').some(v=>v.split(':')[0]===raw)||m.text.split(/\s+/).includes(raw);
   case 'domain':{
    let host:string;try{const url=new URL('https://'+raw);if(url.username||url.password||url.port||url.pathname!=='/'||url.search||url.hash||!url.hostname.includes('.'))throw new Error();host=url.hostname.toLowerCase();}catch{throw new Error('Use a bare link domain, for example example.org');}
    return (m:ChatMessage)=>findLinks(m.text.slice(0,2000)).some(link=>{const actual=new URL(link.href).hostname.toLowerCase();return actual===host||actual.endsWith('.'+host);});
   }
   case 'before':case 'after':{const time=timestamp(raw);return (m:ChatMessage)=>field==='before'?m.timestamp<=time:m.timestamp>=time;}
   case 'is':switch(needle){
    case 'shared':return (m:ChatMessage)=>sharedContext(m)!==undefined;
    case 'reward':return (m:ChatMessage)=>messageReward(m)!==undefined;
    case 'streak':return (m:ChatMessage)=>watchStreak(m)!==undefined;
    case 'effect':return (m:ChatMessage)=>messageEffect(m)!==undefined;
    case 'reply':return (m:ChatMessage)=>!!m.tags['reply-parent-msg-id'];
    case 'moderation':return (m:ChatMessage)=>m.command==='CLEARMSG'||m.command==='CLEARCHAT';
    case 'deleted':return (m:ChatMessage)=>m.command==='CLEARMSG'||m.tags.deleted==='true'||m.tags.deleted==='1';
    case 'system':return (m:ChatMessage)=>m.command!=='PRIVMSG';
    case 'message':return (m:ChatMessage)=>m.command==='PRIVMSG';
    case 'link':return (m:ChatMessage)=>findLinks(m.text.slice(0,2000)).length>0;
    default:throw new Error('is accepts reply, moderation, deleted, system, message, link, shared, reward, streak or effect');
   }
  }
 });
 return m=>clause.negated?!checks.some(check=>check(m)):checks.some(check=>check(m));
}
export function parseArchiveQuery(source:string,identity?:ArchiveIdentityPolicy):StructuredArchiveQuery {
 if(source.length>1000)throw new Error('Keep the query within 1,000 characters');
 const tokens=split(source.trim(),'space');if(tokens.length>32)throw new Error('Use at most 32 filter clauses');
 const clauses:ArchiveClause[]=tokens.map(token=>{
  const negated=token.startsWith('-');const raw=negated?token.slice(1):token;
  const match=/^([a-z]+):/i.exec(raw);const keyed=match&&!/^https?:\/\//i.test(raw);
  const values=keyed?split(raw.slice(match[0].length),'comma').map(value):[value(raw)];
  if(values.length>10)throw new Error('Use at most 10 alternatives per filter');
  return {field:keyed?field(match[1]!.toLowerCase()):'text',values,negated};
 });
 const predicates=clauses.map(c=>compile(c,identity));return {source,clauses,matches:m=>predicates.every(match=>match(m))};
}
export function formatArchiveClause(field:ArchiveField,values:readonly string[],negated=false):string {
 const result=(negated?'-':'')+field+':'+values.map(v=>JSON.stringify(v)).join(',');parseArchiveQuery(result);return result;
}
