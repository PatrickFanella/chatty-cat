import {sharedContext,messageContextLabels} from './message-context';
import {cosmeticBadges} from './cosmetics';
import {getProviderPreferences,showBadge} from './provider-preferences';
import {getPresentation,formatTimestamp,usernameLabel} from './presentation';
import {getLocalNickname} from './completion-preferences';
import {privacyEnabled} from './privacy';
import { channelURL, CHANNEL_COLORS } from './channels';
import {nativeGifTitle,gifTitleLink} from './gifs';
import { appendLinks, readableColor, observeUserColor } from './links';
import type { ChatMessage } from './protocol';
import type { ChannelMetadata } from './metadata';
import { tokenize, type Emote } from './tokens';

function badgeImage(metadata:ChannelMetadata|undefined,set:string,version:string,origin=false,roomID=''):HTMLElement{
 const native=metadata?.badges[set]?.[version],prefs=getProviderPreferences();
 const custom=(set==='moderator'||set==='vip')&&prefs.ffzRoleArtwork[set]?metadata?.ffzRoleBadges?.[set]:undefined;
 const selected=custom??native,prefix=origin?'Origin ':'';
 if(!selected){const chip=document.createElement('span');chip.className='badge-fallback';chip.textContent='['+set+']';return chip;}
 let badge=selected;const image=document.createElement('img');image.className='badge'+(origin?' source-badge':'');image.referrerPolicy='no-referrer';
 const update=():void=>{image.src=badge.url;image.alt='['+prefix+(badge.title||set)+']';image.title=(origin?'Origin room '+roomID+' · ':'')+[badge.title||set,badge.description].filter(Boolean).join(' · ');};
 image.addEventListener('error',()=>{if(badge===custom&&native&&native.url!==badge.url){badge=native;update();}else image.replaceWith(document.createTextNode('['+prefix+set+']'));});update();return image;
}

function emoteImage(emote: Emote, frozen: boolean): HTMLElement {
  const prefs=getProviderPreferences();
  if(!prefs.animated&&emote.animated&&!emote.staticUrl){const label=document.createElement('span');label.className='emote emote-fallback';label.textContent=emote.code;label.title=emote.code+' · '+emote.source+' · static image unavailable';return label;}
  const img = document.createElement('img');
  img.className = 'emote';img.dataset.emoteCode=emote.code;img.dataset.emoteSource=emote.source;
  img.src = (frozen||!prefs.animated) && emote.staticUrl ? emote.staticUrl : emote.url;
  if(prefs.scale!==1)img.style.height=String(1.75*prefs.scale)+'em';
  img.alt = emote.code;
  img.title = `${emote.code} · ${emote.source}`;
  img.loading = 'lazy';
  img.decoding = 'async';
  img.addEventListener('error', () => {
    if (emote.staticUrl && img.src !== emote.staticUrl) img.src = emote.staticUrl;
    else img.replaceWith(document.createTextNode(emote.code));
  });
  return img;
}

export function messageText(message: ChatMessage, metadata: ChannelMetadata | undefined, frozen = false, users?:ReadonlyMap<string,boolean>): HTMLElement {
  const text = document.createElement('span');
  text.className = 'message';
  const gif=message.command==='PRIVMSG'?nativeGifTitle(message.text):undefined;
  if(gif){text.append(gifTitleLink(gif));return text;}
  const tokens = tokenize(message.text, message.tags.emotes ?? '', metadata?.emotes ?? {},
    document.documentElement.dataset.theme === 'light', /^[1-9][0-9]*$/.test(message.tags.bits??''));
  let stack: HTMLElement | null = null;
  for (const token of tokens) {
    if (token.type === 'text') {
      const value = token.text;
      appendLinks(text, value, users);
      if (value.trim()) stack = null;
    } else {
      const image = emoteImage(token.emote, frozen);
      if (token.emote.zeroWidth && stack) {
        image.classList.add('overlay');
        stack.append(image);
      } else {
        stack = document.createElement('span');
        stack.className = 'emote-stack';
        stack.append(image);
        text.append(stack);
      }
    }
  }
  if (tokens.some((token) => token.type === 'emote') && tokens.every((token) => token.type === 'emote' || !token.text.trim())) text.classList.add('emote-only');
  return text;
}

export function messageRow(message: ChatMessage, metadata?: ChannelMetadata, frozen = false, users?:ReadonlyMap<string,boolean>, sourceMetadata?:ChannelMetadata): HTMLElement {
  observeUserColor(message.login,message.tags.color??'');
  const p=getPresentation();
  const row = document.createElement('article');
  row.className = 'row';
  row.dataset.id = message.id; row.dataset.timestamp = String(message.timestamp); row.dataset.command = message.command;
  row.dataset.login = message.login;
  row.dataset.channel = message.channel;
  const time = document.createElement('time');
  if (message.timestamp > 0) {
    const date = new Date(message.timestamp);
    time.dateTime = date.toISOString();
    const mode = Number(document.documentElement.dataset.times ?? 2);
    time.textContent = p.timestampFormat!=='legacy'?formatTimestamp(date,p.timestampFormat):date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', ...(mode === 2 || mode === 4 ? { second: '2-digit' as const } : {}), hour12: mode === 3 || mode === 4 });
  }
  const channel = document.createElement('a');
  channel.className = 'channel';
  channel.textContent = '#' + message.channel;
  const current = new URL(location.href), joined = [...new Set((current.searchParams.get('channel') ?? message.channel).toLowerCase().split(',').filter(name => /^[a-z0-9_]{1,25}$/.test(name)))].slice(0, 6);
  if (joined.includes(message.channel)) { channel.href = channelURL(current, joined, { kind: 'focus', channel: message.channel }).href; channel.title = 'Focus #' + message.channel; channel.style.color = CHANNEL_COLORS[Math.max(0, joined.indexOf(message.channel))] ?? ''; }
  const name = document.createElement('a');
  if (/^[a-z0-9_]{1,25}$/i.test(message.login)) name.href = 'https://www.twitch.tv/' + message.login;
  name.target = '_blank'; name.rel = 'noopener noreferrer';
  name.className = 'name';
  if (['fossabot','blammobot'].includes(message.login.toLowerCase())) name.classList.add('shimmer');
  name.textContent = usernameLabel(message.login,message.tags['display-name']??'',p.usernameMode)||message.command.toLowerCase();
  const alias=getLocalNickname(message.login);if(alias&&!privacyEnabled()){name.textContent=alias+' · '+message.login;name.title='Local nickname; Twitch login: '+message.login;}
  name.style.color = p.colorUsernames?readableColor(message.tags.color ?? '', document.documentElement.dataset.theme === 'light'):'';
  const text = messageText(message, metadata, frozen, users);
  if (message.command !== 'PRIVMSG') { row.classList.add('notice'); const label=document.createElement('span');label.className='notice-label rainbow';label.textContent='['+(message.tags['msg-id']||message.command.toLowerCase())+']';row.append(label); }
  if (message.text.startsWith('\x01ACTION ') && message.text.endsWith('\x01')) {
    row.classList.add('action');
  }
  const parent = message.tags['reply-parent-display-name'] ?? message.tags['reply-parent-user-login'];
  if (parent) {
    const quote = document.createElement('blockquote');
    quote.textContent = `${parent}: ${message.tags['reply-parent-msg-body'] ?? ''}`;
    const parentID = message.tags['reply-parent-msg-id'];
    if (parentID) {
      const jump = document.createElement('button'); jump.type = 'button'; jump.dataset.jump = parentID;
      jump.className = 'parent-jump'; jump.textContent = 'Jump to parent'; quote.append(' ', jump);
    }
    row.append(quote);
  }
  if(message.command==='PRIVMSG'&&message.id){const thread=document.createElement('button');thread.type='button';thread.dataset.thread=message.id;thread.textContent='Thread';thread.className='thread-open';row.append(thread);}
  const badges = document.createElement('span');
  badges.className = 'badges';
  for (const entry of (message.tags.badges ?? '').split(',')) {
    const [set, version] = entry.split('/');
    if (!set || !version || !showBadge(set)) continue;
    badges.append(badgeImage(metadata,set,version));
  }
  for(const badge of cosmeticBadges(message.tags['user-id']??'')){const image=document.createElement('img');image.className='badge cosmetic-badge';image.src=badge.url;image.alt='['+badge.provider+' cosmetic: '+badge.title+']';image.title=badge.provider+' cosmetic · '+badge.title+' · not a Twitch role';image.loading='lazy';image.referrerPolicy='no-referrer';image.addEventListener('error',()=>image.replaceWith(document.createTextNode(image.alt)),{once:true});badges.append(image);}
  row.append(time, channel);
  const shared=sharedContext(message),contextLabels=messageContextLabels(message,sourceMetadata?.channel);
  if(contextLabels.length){const context=document.createElement('span');context.className='message-context';context.textContent=contextLabels.join(' · ');row.append(context);}
  if(shared){const source=document.createElement('span');source.className='source-badges';source.textContent='Origin badges: ';if(shared.badges===undefined)source.append('not supplied');else if(!shared.badges.length)source.append('none reported');else for(const entry of shared.badges){if(!showBadge(entry.set))continue;source.append(badgeImage(sourceMetadata,entry.set,entry.version,true,shared.roomID));}row.append(source);}

  const sub=document.createElement('span');sub.className='sub-months';
  const months=/(?:^|,)subscriber\/(\d+)(?:,|$)/.exec(message.tags['badge-info']??'')?.[1];
  sub.dataset.months=months??'--';sub.title=months?`${months} subscriber months reported`:'No subscriber months reported';
  const full=document.createElement('span');full.className='sub-full';full.textContent='[sub '+(months??'--')+']';
  const compact=document.createElement('span');compact.className='sub-compact';compact.textContent=months??'--';sub.append(full,compact);
  if(message.command==='PRIVMSG'&&!['fossabot','blammobot'].includes(message.login.toLowerCase()))row.append(sub);
  row.append(badges,name);
  const chips = document.createElement('span'); chips.className = 'message-chips';
  const labels: string[] = [];
  if (message.tags['first-msg'] === '1') labels.push('first');
  if (message.tags['returning-chatter'] === '1') labels.push('returning');
  if (/^[1-9][0-9]*$/.test(message.tags.bits ?? '')) labels.push(message.tags.bits + ' bits');
  for (const label of labels) { const chip = document.createElement('span'); chip.textContent = label; chips.append(chip); }
  if (labels.length) row.append(chips);
  if (message.command === 'USERNOTICE') {
    const kind = message.tags['msg-id']; if (kind && /^[a-z-]+$/.test(kind)) row.dataset.notice = kind;
    const system = document.createElement('span'); system.className = 'system-message';
    const who = message.tags['display-name'] || message.login;
    let value = message.tags['system-msg'] ?? '';
    if (who && value.slice(0, who.length).toLowerCase() === who.toLowerCase() && !/\w/.test(value[who.length] ?? '')) value = value.slice(who.length).replace(/^\s*[-–—,:]?\s*/, '');
    appendLinks(system, value); row.append(system); if (value && message.text) row.append(' — ');
  }
  if (message.command === 'CLEARCHAT') text.textContent = message.text ? `${message.text} ${message.tags['ban-duration'] ? 'timed out for ' + message.tags['ban-duration'] + 's' : 'banned'}` : 'Chat cleared';
  if (message.command==='JOIN'||message.command==='PART')text.textContent=message.login+(message.command==='JOIN'?' joined the channel':' left the channel');
  if (message.command === 'CLEARMSG') text.textContent = 'Message deleted';
  text.classList.add('message-body');
  if(p.collapseLines>0&&message.command==='PRIVMSG'&&message.text.length>80){text.classList.add('collapsed-message');const expand=document.createElement('button');expand.type='button';expand.className='expand-message';expand.textContent='Expand message';expand.setAttribute('aria-expanded','false');expand.addEventListener('click',()=>{const collapsed=text.classList.toggle('collapsed-message');expand.textContent=collapsed?'Expand message':'Collapse message';expand.setAttribute('aria-expanded',String(!collapsed));});row.append(expand);}
  row.append(text);
  if (message.command === 'PRIVMSG' && message.id) {
    const reply = document.createElement('button');
    reply.type = 'button'; reply.className = 'reply'; reply.dataset.reply = message.id;
    reply.textContent = 'Reply'; reply.setAttribute('aria-label', `Reply to ${message.login} in ${message.channel}`);
    row.append(reply);
  }
  if (message.id && message.command === 'PRIVMSG') {
    const link = document.createElement('button'); link.type = 'button'; link.className = 'permalink';
    link.dataset.permalink = message.id; link.textContent = 'Link'; link.setAttribute('aria-label', 'Link to this message'); row.append(link);
  }
  if(message.tags['bookmark-excerpt']==='1'){const saved=document.createElement('span');saved.className='saved-excerpt';saved.textContent='[saved excerpt]';row.append(saved);}
  if(['PRIVMSG','USERNOTICE','NOTICE','CLEARCHAT','CLEARMSG'].includes(message.command)){
    const bookmark=document.createElement('button');bookmark.type='button';bookmark.dataset.bookmark='';bookmark.className='bookmark-message';bookmark.textContent='Bookmark';bookmark.setAttribute('aria-label','Bookmark this public message');row.append(bookmark);
  }
  return row;
}

export function decoratePresentation(row:HTMLElement,message:ChatMessage,removed:boolean,historical:boolean):void{row.classList.toggle('removed',removed);row.classList.toggle('history-message',historical);if(removed){const body=row.querySelector('.message-body');if(body){const limit=getPresentation().deletedLength;body.textContent=[...message.text].slice(0,limit).join('')+([...message.text].length>limit?'…':'');}}}
