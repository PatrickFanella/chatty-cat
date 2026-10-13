import {getProfileScope,profileKey} from './account-profiles';
import {privacyEnabled} from './privacy';
import type {ChannelMetadata,Provider} from './metadata';
import type {Emote} from './tokens';
export const PROVIDERS=['7TV','BTTV','FFZ','Twitch'] as const;
export const BADGE_CATEGORIES=['globalAuthority','channelAuthority','subscription','predictions','vanity'] as const;
type BadgeCategory=typeof BADGE_CATEGORIES[number];
export interface ProviderPreferences {version:1;stackBits:boolean;scaleEmotesByLineHeight:boolean;showUnlistedSevenTV:boolean;removeSpacesBetweenEmotes:boolean;tooltipScale:number;ffzRoleArtwork:{moderator:boolean;vip:boolean};cosmetics:{FFZ:boolean;Chatterino:boolean};providers:Record<Provider,{global:boolean;channel:boolean;live:boolean}>;badges:Record<BadgeCategory,boolean>;animated:boolean;scale:number}
export function providerDefaults():ProviderPreferences{return {version:1,stackBits:false,scaleEmotesByLineHeight:false,showUnlistedSevenTV:false,removeSpacesBetweenEmotes:false,tooltipScale:1,ffzRoleArtwork:{moderator:true,vip:true},cosmetics:{FFZ:false,Chatterino:false},providers:{'7TV':{global:true,channel:true,live:true},BTTV:{global:true,channel:true,live:true},FFZ:{global:true,channel:true,live:true},Twitch:{global:true,channel:true,live:true}},badges:{globalAuthority:true,channelAuthority:true,subscription:true,predictions:true,vanity:true},animated:true,scale:1};}
function record(v:unknown):v is Record<string,unknown>{return !!v&&typeof v==='object'&&!Array.isArray(v);}
export function parseProviderPreferences(v:unknown):ProviderPreferences{
 if(v===null)return providerDefaults();
 if(!record(v)||v.version!==1||!record(v.providers)||!record(v.badges)||typeof v.animated!=='boolean'||typeof v.scale!=='number'||!Number.isFinite(v.scale)||v.scale<0.5||v.scale>3)throw new Error('Invalid provider preferences');
 const p=providerDefaults();
 for(const key of ['stackBits','scaleEmotesByLineHeight','showUnlistedSevenTV','removeSpacesBetweenEmotes'] as const){if(v[key]!==undefined){if(typeof v[key]!=='boolean')throw new Error('Invalid emote presentation preference');p[key]=v[key];}}
 if(v.tooltipScale!==undefined){if(typeof v.tooltipScale!=='number'||![0.5,1,1.5,2].includes(v.tooltipScale))throw new Error('Invalid emote tooltip scale');p.tooltipScale=v.tooltipScale;}
 if(v.ffzRoleArtwork!==undefined){if(!record(v.ffzRoleArtwork)||typeof v.ffzRoleArtwork.moderator!=='boolean'||typeof v.ffzRoleArtwork.vip!=='boolean')throw new Error('Invalid FFZ role artwork preferences');p.ffzRoleArtwork={moderator:v.ffzRoleArtwork.moderator,vip:v.ffzRoleArtwork.vip};}
 if(v.cosmetics!==undefined){if(!record(v.cosmetics)||typeof v.cosmetics.FFZ!=='boolean'||typeof v.cosmetics.Chatterino!=='boolean')throw new Error('Invalid cosmetic preferences');p.cosmetics={FFZ:v.cosmetics.FFZ,Chatterino:v.cosmetics.Chatterino};}
 p.animated=v.animated;p.scale=v.scale;
 for(const provider of PROVIDERS){const entry=v.providers[provider];if(!record(entry))throw new Error('Missing provider preferences');for(const key of ['global','channel','live'] as const){if(typeof entry[key]!=='boolean')throw new Error('Provider options must be boolean');p.providers[provider][key]=entry[key];}}
 for(const category of BADGE_CATEGORIES){if(typeof v.badges[category]!=='boolean')throw new Error('Badge options must be boolean');p.badges[category]=v.badges[category];}
 return p;
}
let current=providerDefaults();
export function getProviderPreferences():ProviderPreferences{return current;}
export function setProviderPreferences(v:ProviderPreferences):void{current=parseProviderPreferences(v);}
export function badgeCategory(set:string):BadgeCategory{
 if(['staff','admin','global_mod','twitchbot','partner'].includes(set))return 'globalAuthority';
 if(['broadcaster','moderator','vip','lead_moderator'].includes(set))return 'channelAuthority';
 if(['subscriber','founder'].includes(set))return 'subscription';
 if(set==='predictions')return 'predictions';return 'vanity';
}
export function showBadge(set:string):boolean{return current.badges[badgeCategory(set)];}
export function selectProviderMetadata(data:ChannelMetadata,p:ProviderPreferences):ChannelMetadata{
 const emotes:Record<string,Emote>=Object.create(null) as Record<string,Emote>;
 if(data.emoteSets){for(const set of data.emoteSets)if(p.providers[set.provider][set.scope]){for(const [code,e] of Object.entries(set.emotes))if(!e.unlisted||p.showUnlistedSevenTV)emotes[code]=e;}}
 else {for(const [code,e] of Object.entries(data.emotes)){const provider=PROVIDERS.find(value=>e.source.startsWith(value));if(provider&&p.providers[provider].global&&p.providers[provider].channel&&(!e.unlisted||p.showUnlistedSevenTV))emotes[code]=e;}}
 return {...data,emotes};
}
// With live refresh off, retain each already-seen provider until an explicit reload.
export function reconcileProviderMetadata(data:ChannelMetadata,previous:ChannelMetadata|undefined,p:ProviderPreferences,manual=false):ChannelMetadata{
 if(!data.emoteSets||!previous?.emoteSets||manual)return data;
 return {...data,emoteSets:data.emoteSets.map(set=>!p.providers[set.provider].live?(previous.emoteSets?.find(old=>old.provider===set.provider&&old.scope===set.scope)??set):set)};
}
export class ProviderPreferenceStore {
 private account=getProfileScope();private key=profileKey('chatthing:v1:provider-preferences');private raw=localStorage.getItem(this.key);
 read():ProviderPreferences{if(this.account!==getProfileScope())throw new Error('Account changed; reopen provider preferences');if(this.raw&&this.raw.length>8192)throw new Error('Provider preferences exceed limit');return parseProviderPreferences(this.raw?JSON.parse(this.raw):null);}
 save(p:ProviderPreferences):void{this.read();if(localStorage.getItem(this.key)!==this.raw)throw new Error('Provider preferences changed in another tab; reopen');const raw=JSON.stringify(parseProviderPreferences(p));localStorage.setItem(this.key,raw);this.raw=raw;}
}
export class ProviderPanel {
 readonly root=document.createElement('dialog');private trigger=document.createElement('button');private status=document.createElement('p');private cosmeticNotice=document.createElement('p');private store:ProviderPreferenceStore|undefined;private pending:ProviderPreferences|undefined;private apply:HTMLButtonElement;
 constructor(private changed:()=>void,private reload:()=>boolean,readonlyView=false){
  this.root.setAttribute('aria-label','Provider and badge preferences');const h=document.createElement('h2');h.textContent='Provider emotes and Twitch badges';const note=document.createElement('p');note.textContent='These preferences affect this account on this browser. Existing public provider metadata is checked every minute; the server caches emote sets for up to ten minutes. Live refresh uses bounded polling, not provider event sockets. Turning off display does not disable server metadata requests. Native Twitch tag ranges still identify sent emotes. Optional cosmetic badges require server configuration and your opt-in here. Enabling cosmetics sends at most 100 recent public-message user IDs per minute to this server; it reads configured public catalogs. Badge images contact their host from your browser. Cosmetic badges do not prove Twitch roles. FFZ role artwork only replaces the image of a native moderator/VIP tag, with native-image fallback. No presence/activity writes are sent.';this.root.append(h,note,this.cosmeticNotice);this.cosmeticNotice.textContent='Cosmetic services are off by default and require server configuration.';
  for(const provider of PROVIDERS)for(const key of ['global','channel','live'] as const)this.checkbox(provider+'.'+key,provider+' '+(key==='live'?'live refresh':key+' emotes'));
  for(const role of ['moderator','vip'] as const)this.checkbox('ffzRoleArtwork.'+role,'Use FFZ '+role+' artwork for native Twitch badges');
  for(const cosmetic of ['FFZ','Chatterino'] as const)this.checkbox('cosmetic.'+cosmetic,'Allow '+cosmetic+' cosmetic badges (requires server configuration)');
  for(const category of BADGE_CATEGORIES)this.checkbox('badge.'+category,'Show '+category+' badges');this.checkbox('animated','Animate emotes');this.checkbox('stackBits','Combine recognized cheers when their amounts match Twitch’s bits total');this.checkbox('scaleEmotesByLineHeight','Scale emotes by chat line height');this.checkbox('showUnlistedSevenTV','Show unlisted 7TV emotes');this.checkbox('removeSpacesBetweenEmotes','Remove visual spaces between emotes');
 const tooltip=document.createElement('label');tooltip.textContent='Emote tooltip scale (0.5, 1, 1.5 or 2; image tooltip consent required)';const tooltipInput=document.createElement('input');tooltipInput.type='number';tooltipInput.name='tooltipScale';tooltipInput.min='0.5';tooltipInput.max='2';tooltipInput.step='0.5';tooltip.append(tooltipInput);this.root.append(tooltip);
  const label=document.createElement('label');label.textContent='Emote scale (0.5–3)';const input=document.createElement('input');input.type='number';input.name='scale';input.min='0.5';input.max='3';input.step='0.1';label.append(input);this.root.append(label);
  this.status.setAttribute('role','status');this.apply=this.button('Apply provider preferences',()=>this.commit());this.root.append(this.button('Review provider preferences',()=>this.review()),this.apply,this.button('Reload provider metadata',()=>{this.status.textContent=this.reload()?'Reload requested; existing server cache remains in effect.':'Wait 30 seconds between reload requests.';}),this.button('Close provider preferences',()=>this.root.close()),this.status);
  this.trigger.type='button';this.trigger.textContent='Provider and badge preferences';this.trigger.hidden=readonlyView;document.getElementById('commands-open')?.after(this.trigger);this.trigger.addEventListener('click',this.open);this.root.addEventListener('input',this.invalidate);this.root.addEventListener('change',this.invalidate);this.root.addEventListener('close',this.invalidate);document.addEventListener('privacychange',this.privacy);document.body.append(this.root);this.load();
 }
 cosmeticsStatus(detail:string):void{this.cosmeticNotice.textContent=detail;}
 private checkbox(name:string,text:string):void{const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.name=name;label.append(input,text);this.root.append(label);}
 private field(name:string):HTMLInputElement{const input=this.root.querySelector('input[name="'+name+'"]');if(!(input instanceof HTMLInputElement))throw new Error('Missing provider field');return input;}
 private button(text:string,action:()=>void):HTMLButtonElement{const b=document.createElement('button');b.type='button';b.textContent=text;b.addEventListener('click',()=>{try{action();}catch(error){this.status.textContent=error instanceof Error?error.message:'Preferences unavailable';}});return b;}
 private load():void{try{this.store=new ProviderPreferenceStore();const p=this.store.read();setProviderPreferences(p);for(const role of ['moderator','vip'] as const)this.field('ffzRoleArtwork.'+role).checked=p.ffzRoleArtwork[role];for(const provider of PROVIDERS)for(const key of ['global','channel','live'] as const)this.field(provider+'.'+key).checked=p.providers[provider][key];for(const cosmetic of ['FFZ','Chatterino'] as const)this.field('cosmetic.'+cosmetic).checked=p.cosmetics[cosmetic];for(const category of BADGE_CATEGORIES)this.field('badge.'+category).checked=p.badges[category];for(const key of ['stackBits','scaleEmotesByLineHeight','showUnlistedSevenTV','removeSpacesBetweenEmotes'] as const)this.field(key).checked=p[key];this.field('tooltipScale').value=String(p.tooltipScale);this.field('animated').checked=p.animated;this.field('scale').value=String(p.scale);this.status.textContent='';}catch{this.store=undefined;setProviderPreferences(providerDefaults());this.status.textContent='Saved preferences unavailable; existing data retained.';}this.invalidate();}
 private review():void{if(privacyEnabled()||!this.store)throw new Error('Preferences unavailable');this.store.read();const p=providerDefaults();for(const role of ['moderator','vip'] as const)p.ffzRoleArtwork[role]=this.field('ffzRoleArtwork.'+role).checked;for(const provider of PROVIDERS)for(const key of ['global','channel','live'] as const)p.providers[provider][key]=this.field(provider+'.'+key).checked;for(const cosmetic of ['FFZ','Chatterino'] as const)p.cosmetics[cosmetic]=this.field('cosmetic.'+cosmetic).checked;for(const category of BADGE_CATEGORIES)p.badges[category]=this.field('badge.'+category).checked;for(const key of ['stackBits','scaleEmotesByLineHeight','showUnlistedSevenTV','removeSpacesBetweenEmotes'] as const)p[key]=this.field(key).checked;p.tooltipScale=Number(this.field('tooltipScale').value);p.animated=this.field('animated').checked;p.scale=Number(this.field('scale').value);this.pending=parseProviderPreferences(p);this.status.textContent=JSON.stringify(this.pending,null,2)+'\nApply saves this browser profile only; no chat or activity message is sent.';this.apply.disabled=false;}
 private commit():void{if(privacyEnabled()||!this.pending||!this.store)throw new Error('Review preferences first');this.store.save(this.pending);setProviderPreferences(this.pending);this.invalidate();document.dispatchEvent(new Event('presentation-before-change'));this.changed();this.status.textContent='Provider preferences saved.';}
 private invalidate=():void=>{this.pending=undefined;this.apply.disabled=true;};
 private open=():void=>{if(privacyEnabled())return;this.load();this.root.showModal();};
 private privacy=():void=>{if(privacyEnabled()){this.invalidate();this.root.close();}};
 stop():void{document.removeEventListener('privacychange',this.privacy);this.trigger.removeEventListener('click',this.open);this.root.removeEventListener('input',this.invalidate);this.root.removeEventListener('change',this.invalidate);this.root.removeEventListener('close',this.invalidate);this.root.remove();this.trigger.remove();setProviderPreferences(providerDefaults());}
}
