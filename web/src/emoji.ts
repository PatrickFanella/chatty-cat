import {EMOJI_CATALOG,EMOJI_VERSION} from './emoji-catalog';
import {EMOJI_KW as legacyKeywords} from './emoji-legacy';
export {EMOJI_CATALOG,EMOJI_VERSION};
export const EMOJIS:readonly string[]=EMOJI_CATALOG.map(entry=>entry.code);
export const EMOJI_GROUPS:readonly string[]=[...new Set(EMOJI_CATALOG.map(entry=>entry.group))];
export const EMOJI_KW:Readonly<Record<string,string>>=Object.fromEntries(EMOJI_CATALOG.map(entry=>[entry.code,[entry.name,entry.group,entry.subgroup,'Unicode '+entry.version,legacyKeywords[entry.code]??''].join(' ')]));
const catalog=new Map(EMOJI_CATALOG.map(entry=>[entry.code,entry]));
export function emojiEntry(code:string){return catalog.get(code);}
export function emojiImage(code:string):string|undefined{const entry=emojiEntry(code);return entry?'/emoji/twemoji-17.0.3/'+entry.asset:undefined;}
export type EmojiStyle='native'|'image'|'labels';
let style:EmojiStyle='native';
export function setEmojiStyle(value:EmojiStyle):void{if(value!==style){style=value;document.dispatchEvent(new Event('emojistylechange'));}}
export function getEmojiStyle():EmojiStyle{return style;}
const pattern=new RegExp([...EMOJIS].sort((a,b)=>b.length-a.length).map(code=>code.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'gu');
export function observedEmoji(text:string):string[]{return [...text.matchAll(pattern)].map(match=>match[0]);}
export function emojiNode(code:string,presentation:EmojiStyle=style):Node{
 const entry=emojiEntry(code);if(!entry||presentation==='native')return document.createTextNode(code);
 const label=():HTMLSpanElement=>{const span=document.createElement('span');span.className='emoji-label';span.textContent='['+entry.name+']';span.title=code+' · '+[...code].map(char=>'U+'+char.codePointAt(0)?.toString(16).toUpperCase()).join(' ');return span;};
 if(presentation==='labels')return label();const image=document.createElement('img');image.className='emoji-image';image.src='/emoji/twemoji-17.0.3/'+entry.asset;image.alt=code+' · '+entry.name;image.title=entry.name+' · Unicode '+entry.version;image.dataset.emojiCode=code;image.loading='lazy';image.decoding='async';image.referrerPolicy='no-referrer';image.style.width='1.25em';image.style.height='1.25em';image.style.verticalAlign='middle';image.addEventListener('error',()=>image.replaceWith(label()),{once:true});return image;
}
export function appendEmojiText(root:HTMLElement,text:string):void{if(style==='native'){root.append(document.createTextNode(text));return;}let offset=0;for(const match of text.matchAll(pattern)){root.append(document.createTextNode(text.slice(offset,match.index)),emojiNode(match[0]));offset=match.index+match[0].length;}root.append(document.createTextNode(text.slice(offset)));}
