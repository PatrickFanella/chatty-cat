import { previewMode } from './preview';
import type { ChatMessage } from './protocol';
import { readableColor } from './links';
export interface Profile {login:string;name:string;bio:string;image:string;color:string;created:string;followers:number|null;partner:boolean;affiliate:boolean}
export function parseProfile(value:unknown,login:string):Profile {
 if(!value||typeof value!=='object')throw new Error('Invalid profile');const d=value as Record<string,unknown>;
 for(const key of ['login','name','bio','image','color','created'])if(typeof d[key]!=='string')throw new Error('Invalid profile field');
 if(!/^[a-z0-9_]{1,25}$/.test(login)||d.login!==login||!/^#[a-f0-9]{6}$/i.test(String(d.color))&&d.color!==''||typeof d.partner!=='boolean'||typeof d.affiliate!=='boolean'||d.followers!==null&&(!Number.isSafeInteger(d.followers)||Number(d.followers)<0))throw new Error('Invalid profile identity');
 if(d.image){const image=new URL(String(d.image));if(image.protocol!=='https:'||image.username||image.password)throw new Error('Invalid profile image');}
 if(d.created&&!Number.isFinite(Date.parse(String(d.created))))throw new Error('Invalid profile date');
 return {login,name:String(d.name).slice(0,100),bio:String(d.bio).slice(0,1000),image:String(d.image).slice(0,2048),color:String(d.color),created:String(d.created),followers:d.followers as number|null,partner:d.partner,affiliate:d.affiliate};
}
export function emotePage(source:string,image:string):string {
 const id=source==='7TV'?/\/emote\/([\w-]+)\//.exec(image)?.[1]:source==='BTTV'?/\/emote\/([\w-]+)\//.exec(image)?.[1]:source==='FFZ'?/\/(?:emoticon|emote)\/([0-9]+)\//.exec(image)?.[1]:undefined;
 return id?(source==='7TV'?'https://7tv.app/emotes/':source==='BTTV'?'https://betterttv.com/emotes/':'https://www.frankerfacez.com/emoticon/')+id:image;
}
export class IdentityCards {
 private timer:ReturnType<typeof setTimeout>|undefined;
 private generation=0;
 private anchor:HTMLElement|undefined;
 private abort:AbortController|undefined;
 private cache=new Map<string,{profile:Profile;until:number}>();
 constructor(private surface:HTMLElement,private root:HTMLElement,private messages:()=>readonly ChatMessage[],private pronouns:(login:string)=>Promise<string|undefined>){
  surface.addEventListener('pointerover',this.hover);surface.addEventListener('focusin',this.hover);surface.addEventListener('pointerout',this.leave);root.addEventListener('pointerenter',this.hold);root.addEventListener('pointerleave',this.leave);root.addEventListener('click',this.click);document.addEventListener('keydown',this.key);document.addEventListener('previewsettings',this.close);
 }
 private hold=():void=>{clearTimeout(this.timer);};
 private hover=(event:Event):void=>{if(!(event.target instanceof Element))return;const anchor=event.target.closest<HTMLElement>('a.name,a.mention,img.emote,img.badge,img[data-emote-source]');if(!anchor||!(anchor instanceof HTMLImageElement)&&!previewMode())return;this.hold();if(anchor===this.anchor&&!this.root.hidden)return;this.timer=setTimeout(()=>void this.open(anchor),350);};
 private leave=(event:Event):void=>{if(event instanceof PointerEvent&&event.relatedTarget instanceof Node&&(this.root.contains(event.relatedTarget)||this.anchor?.contains(event.relatedTarget)))return;this.hold();this.timer=setTimeout(this.close,500);};
 private position():void {if(!this.anchor)return;const rect=this.anchor.getBoundingClientRect();this.root.style.left=Math.max(12,Math.min(innerWidth-this.root.offsetWidth-12,rect.left))+'px';this.root.style.top=Math.max(16,Math.min(innerHeight-this.root.offsetHeight-16,rect.bottom+6))+'px';}
 private async open(anchor:HTMLElement):Promise<void>{
  if(!(anchor instanceof HTMLImageElement)&&!previewMode())return;this.abort?.abort();this.abort=new AbortController();const generation=++this.generation;this.anchor=anchor;this.root.hidden=false;this.root.replaceChildren();const close=document.createElement('button');close.type='button';close.dataset.closeIdentity='1';close.textContent='Close';this.root.append(close);
  if(anchor instanceof HTMLImageElement){
   const source=anchor.dataset.emoteSource??(anchor.classList.contains('badge')?'Twitch badge':'Twitch');const heading=document.createElement('a');heading.href=emotePage(source,anchor.src);heading.target='_blank';heading.rel='noopener noreferrer';heading.textContent=(anchor.dataset.emoteCode||anchor.alt)+' · '+source;
   const image=document.createElement('img');image.src=anchor.src;image.alt=anchor.alt;image.className='identity-image';image.addEventListener('error',()=>image.remove(),{once:true});this.root.append(heading,image);const details=document.createElement('p');details.textContent=anchor.title;this.root.append(details);this.position();return;
  }
  const row=anchor.closest<HTMLElement>('.row');const login=(anchor.dataset.mention||row?.dataset.login||'').toLowerCase();if(!/^[a-z0-9_]{1,25}$/.test(login)){this.close();return;}
  const name=document.createElement('a');name.href='https://www.twitch.tv/'+login;name.target='_blank';name.rel='noopener noreferrer';name.textContent=anchor.textContent||login;name.style.color=readableColor('',document.documentElement.dataset.theme==='light');this.root.append(name);
  const count=this.messages().filter(message=>message.login.toLowerCase()===login&&message.command==='PRIVMSG').length;const retained=document.createElement('p');retained.textContent=count.toLocaleString()+' retained messages';this.root.append(retained);const pronounLine=document.createElement('p');this.root.append(pronounLine);void this.pronouns(login).then(label=>{if(label&&generation===this.generation){pronounLine.textContent=label;this.position();}});this.position();
  try{const cached=this.cache.get(login);let profile:Profile;if(cached&&cached.until>Date.now())profile=cached.profile;else{const response=await fetch('/api/users/'+login,{signal:AbortSignal.any([this.abort.signal,AbortSignal.timeout(15000)])});if(!response.ok)throw new Error('Unavailable');profile=parseProfile(await response.json(),login);this.cache.delete(login);this.cache.set(login,{profile,until:Date.now()+300000});while(this.cache.size>256){const first=this.cache.keys().next().value;if(first)this.cache.delete(first);else break;}}
   if(generation!==this.generation)return;name.textContent=profile.name;name.style.color=readableColor(profile.color,document.documentElement.dataset.theme==='light');const bio=document.createElement('p');bio.textContent=profile.bio;const facts=document.createElement('p');facts.textContent=[profile.partner?'Partner':profile.affiliate?'Affiliate':'',profile.created?'Joined '+new Date(profile.created).toLocaleDateString():'',profile.followers!==null?profile.followers.toLocaleString()+' followers':''].filter(Boolean).join(' · ');this.root.append(bio,facts);if(profile.image&&previewMode()>=2){const image=document.createElement('img');image.src=profile.image;image.alt='';image.className='identity-avatar';image.addEventListener('error',()=>image.remove(),{once:true});this.root.append(image);}this.position();
  }catch{if(generation===this.generation){const unavailable=document.createElement('p');unavailable.textContent='Profile details unavailable';this.root.append(unavailable);this.position();}}
 }
 private click=(event:MouseEvent):void=>{if(event.target instanceof Element&&event.target.closest('[data-close-identity]'))this.close();};
 private key=(event:KeyboardEvent):void=>{if(event.key==='Escape'&&!this.root.hidden)this.close();};
 private close=():void=>{this.hold();this.generation++;this.abort?.abort();this.root.hidden=true;this.root.replaceChildren();this.anchor=undefined;};
 stop():void {this.close();this.surface.removeEventListener('pointerover',this.hover);this.surface.removeEventListener('focusin',this.hover);this.surface.removeEventListener('pointerout',this.leave);this.root.removeEventListener('pointerenter',this.hold);this.root.removeEventListener('pointerleave',this.leave);this.root.removeEventListener('click',this.click);document.removeEventListener('keydown',this.key);document.removeEventListener('previewsettings',this.close);}
}
