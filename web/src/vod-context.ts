import type {ChatMessage} from './protocol';
export type VodMessage=Pick<ChatMessage,'channel'|'timestamp'>;
export interface VodRange {start:string;end:string;url:string;title:string}
function record(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
const instant=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
export function parseVodRange(value:unknown):VodRange|undefined {
 if(!record(value)||typeof value.start!=='string'||typeof value.end!=='string'||!instant.test(value.start)||!instant.test(value.end)||typeof value.url!=='string'||!/^https:\/\/www\.twitch\.tv\/videos\/[0-9]{1,30}$/.test(value.url)||typeof value.title!=='string'||value.title.length>300)return;
 const start=Date.parse(value.start),end=Date.parse(value.end);if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end-start>604800000)return;
 return {start:value.start,end:value.end,url:value.url,title:value.title};
}
export function vodOffset(range:VodRange,message:VodMessage):number|undefined {const safe=parseVodRange(range);if(!safe||!Number.isSafeInteger(message.timestamp)||message.timestamp<Date.parse(safe.start)||message.timestamp>=Date.parse(safe.end))return;return Math.floor((message.timestamp-Date.parse(safe.start))/1000);}
export function vodTime(seconds:number):string{if(!Number.isSafeInteger(seconds)||seconds<0||seconds>604800)throw new Error('Invalid VOD offset');return Math.floor(seconds/3600)+'h'+Math.floor(seconds%3600/60)+'m'+seconds%60+'s';}
export function vodFrameURL(range:VodRange,message:VodMessage,hostname:string):string {
 const seconds=vodOffset(range,message);if(seconds===undefined)throw new Error('Message is outside the verified archive range');if(hostname.length>253||!hostname.split('.').every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)))throw new Error('Invalid Twitch parent domain');
 const id=range.url.slice(range.url.lastIndexOf('/')+1);return 'https://player.twitch.tv/?'+new URLSearchParams({video:'v'+id,parent:hostname,time:vodTime(seconds),autoplay:'false',muted:'true'});
}
