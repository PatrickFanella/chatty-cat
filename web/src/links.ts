import {appendEmojiText} from './emoji';
import {getLinkPreferences} from './link-preferences';
import {privacyEnabled} from './privacy';
import {getPresentation} from './presentation';
import {youtubeVideo} from './youtube';
import { twitterMirror } from './nitter';
const userColors = new Map<string,string>();
export function observeUserColor(login:string,color:string):void { if(!/^[a-z0-9_]{1,25}$/i.test(login)||!/^#[0-9a-f]{6}$/i.test(color))return;userColors.delete(login.toLowerCase());userColors.set(login.toLowerCase(),color);while(userColors.size>2000){const first=userColors.keys().next().value;if(first)userColors.delete(first);else break;} }
function appendMentions(root:HTMLElement,text:string,users?:ReadonlyMap<string,boolean>):void {
 const pattern=/(^|[^\w@])@([a-z0-9_]{1,25})(?!\w)|(^|\s)([a-z0-9_]{1,25})(?=[.,!?;:]*(?:\s|$))/gi;let start=0;
 for(const match of text.matchAll(pattern)){
  const explicit=match[2]!==undefined,name=match[2]??match[4]!;
  const login=name.toLowerCase();
  if(!explicit&&(!getPresentation().findAllUsernames||!users?.has(login)))continue;
  const offset=match.index+(match[1]??match[3]??'').length;
  appendEmojiText(root,text.slice(start,offset));
  const link=document.createElement('a');link.className='mention';link.dataset.mention=login;link.href='https://www.twitch.tv/'+login;link.target='_blank';link.rel='noopener noreferrer';link.textContent=(explicit?'@':'')+name;link.style.color=readableColor(userColors.get(login)??'',document.documentElement.dataset.theme==='light');if(login==='hasanabi')link.classList.add('rainbow');root.append(link);start=offset+name.length+(explicit?1:0);
 }
 appendEmojiText(root,text.slice(start));
}
const TRACKING = /^(utm_.+|fbclid|gclid|dclid|mc_cid|mc_eid)$/i;
export function cleanURL(raw: string): string | undefined {
  try {
    if(raw.length>2048||/[\x00-\x20\x7f]/.test(raw))return undefined;
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return undefined;
    for (const key of [...url.searchParams.keys()]) if (TRACKING.test(key)) url.searchParams.delete(key);
    return url.href;
  } catch { return undefined; }
}
function urlLabel(href: string): string { return new URL(href).hostname; }
export interface FoundLink {index:number;raw:string;href:string}
const domains='com|net|org|gg|tv|io|me|be|co|fm|so|live|xyz|dev|app|info|site|link|watch|wiki|art|news|media|social|chat|club|fans|lol|wtf|cool|store|blog|page|video|tube|gov|edu|ca|us|uk|de|fr|es|it|nl|se|no|fi|dk|pl|au|nz|jp|kr|br|mx|in|ru|cn|ee';
export function findLinks(text:string):FoundLink[]{
 const pattern=new RegExp('https?:\\/\\/[^\\s<>\\x00-\\x1f]+|(?:[a-z0-9_-]+\\.)+(?:'+domains+')(?![a-z0-9_-])(?:[?/#][^\\s<>\\x00-\\x1f]*)?','gi');const result:FoundLink[]=[];
 for(const match of text.matchAll(pattern)){const index=match.index;if(index>0&&/[\w@]/.test(text[index-1]!))continue;let raw=match[0].replace(/[.,!?;:"'”’]+$/,'');while(/[)\]]$/.test(raw)&&(raw.match(/[)\]]/g)?.length??0)>(raw.match(/[(\[]/g)?.length??0))raw=raw.slice(0,-1);const href=cleanURL(/^https?:/i.test(raw)?raw:'https://'+raw);if(href)result.push({index,raw,href});}
 return result;
}
export function linkFingerprint(text:string):string {return [...new Set(findLinks(text).map(link=>{const url=new URL(link.href);return url.hostname.replace(/^(?:www|mobile)\./i,'')+url.pathname.replace(/\/$/,'')+url.search+url.hash;}))].sort().join(' ');}
export function inlineImageSource(raw:string):string|undefined {
 try {
  const url=new URL(raw);
  if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443')return undefined;
  const host=url.hostname.toLowerCase();
  if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.includes(':')||/^\d+\.\d+\.\d+\.\d+$/.test(host))return undefined;
  if(['giphy.com','www.giphy.com'].includes(host)){
   const id=url.pathname.match(/^\/(?:gifs|embed)\/(?:[^/]*-)?([A-Za-z0-9]+)\/?$/)?.[1]??url.pathname.match(/^\/media\/([A-Za-z0-9]+)(?:\/|$)/)?.[1];
   if(id&&id.length<=100)return 'https://media.giphy.com/media/'+id+'/giphy.gif';
  }
  if(!/\.(?:gif|webp|png|jpe?g|avif|gifv)$/i.test(url.pathname))return undefined;
  url.hash='';url.pathname=url.pathname.replace(/\.gifv$/i,'.gif');return url.href;
 }catch{return undefined;}
}
export function appendLinks(root: HTMLElement, text: string, users?:ReadonlyMap<string,boolean>): void {
 let start=0;for(const {index,raw,href} of findLinks(text)){
  appendMentions(root,text.slice(start,index),users);
  const source=inlineImageSource(href);
  if(source&&getLinkPreferences().thumbnails&&!privacyEnabled()){const imageLink=document.createElement('a');imageLink.className='chat-image-link';imageLink.href=href;imageLink.target='_blank';imageLink.rel='noopener noreferrer';const image=document.createElement('img');image.src=source;image.alt='Image from '+new URL(href).hostname;image.className='chat-image';image.loading='lazy';image.decoding='async';image.referrerPolicy='no-referrer';image.addEventListener('error',()=>imageLink.remove(),{once:true});imageLink.append(image);root.append(imageLink);}

    const link = document.createElement('a'); link.href = twitterMirror(href) ?? href; link.dataset.canonicalURL = href; link.dataset.preview = href; link.textContent = document.documentElement.dataset.clean==='true' ? raw.replace(/^https?:\/\//i,'').replace(/^www\./i,'').replace(/\/(?:index\.html?)?$/i,'') : (getLinkPreferences().lowercaseDomains?raw.replace(/^(https?:\/\/)?([^/?#]+)/i,(_all,scheme:string|undefined,host:string)=>(scheme??'')+host.toLowerCase()):raw);
    link.target = '_blank'; link.rel = 'noopener noreferrer'; link.className = 'chat-link'; if(document.documentElement.dataset.lkico==='true'&&getLinkPreferences().thumbnails&&!privacyEnabled()){const icon=document.createElement('img');icon.className='link-icon';icon.src='https://icons.duckduckgo.com/ip3/'+encodeURIComponent(new URL(href).hostname)+'.ico';icon.alt='';icon.loading='lazy';icon.referrerPolicy='no-referrer';icon.addEventListener('error',()=>icon.remove(),{once:true});link.prepend(icon);}root.append(link); const preview = document.createElement('button'); preview.type = 'button'; preview.className = 'preview-button'; preview.dataset.preview = href; preview.setAttribute('aria-label', 'Preview ' + urlLabel(href)); root.append(preview);if(getLinkPreferences().unshorten&&!privacyEnabled()){const resolve=document.createElement('button');resolve.type='button';resolve.dataset.resolveLink=href;resolve.textContent='Resolve link';resolve.setAttribute('aria-label','Resolve '+urlLabel(href));root.append(resolve);}if(document.documentElement.dataset.yt!=='false'&&youtubeVideo(href)){const play=document.createElement('button');play.type='button';play.className='youtube-play';play.dataset.youtube=href;play.textContent='▶';play.setAttribute('aria-label','Load YouTube player');play.setAttribute('aria-expanded','false');root.append(play);} start=index+raw.length;
 }
 appendMentions(root,text.slice(start),users);
}
export function readableColor(color: string, light: boolean): string {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return light ? '#365a96' : '#9bbfff';
  let rgb = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
  const luminance = (v: number[]): number => v.map(c => { const s = c / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; }).reduce((sum, c, i) => sum + c * ([.2126, .7152, .0722][i] ?? 0), 0);
  const bg = light ? .96 : .009;
  const contrast = (): number => (Math.max(luminance(rgb), bg) + .05) / (Math.min(luminance(rgb), bg) + .05);
  for (let step = 0; step < 20 && contrast() < 4.5; step++) rgb = rgb.map(c => Math.round(c * .9 + (light ? 0 : 255) * .1));
  return '#' + rgb.map(c => c.toString(16).padStart(2, '0')).join('');
}
