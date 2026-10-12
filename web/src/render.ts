import {nativeGifTitle,gifTitleLink} from './gifs';
import { appendLinks, readableColor, observeUserColor } from './links';
import type { ChatMessage } from './protocol';
import type { ChannelMetadata } from './metadata';
import { tokenize, type Emote } from './tokens';

function emoteImage(emote: Emote, frozen: boolean): HTMLImageElement {
  const img = document.createElement('img');
  img.className = 'emote';img.dataset.emoteCode=emote.code;img.dataset.emoteSource=emote.source;
  img.src = frozen && emote.staticUrl ? emote.staticUrl : emote.url;
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

export function messageText(message: ChatMessage, metadata: ChannelMetadata | undefined, frozen = false): HTMLElement {
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
      appendLinks(text, value);
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

export function messageRow(message: ChatMessage, metadata?: ChannelMetadata, frozen = false): HTMLElement {
  observeUserColor(message.login,message.tags.color??'');
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
    time.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', ...(mode === 2 || mode === 4 ? { second: '2-digit' as const } : {}), hour12: mode === 3 || mode === 4 });
  }
  const channel = document.createElement('span');
  channel.className = 'channel';
  channel.textContent = '#' + message.channel;
  const name = document.createElement('a');
  if (/^[a-z0-9_]{1,25}$/i.test(message.login)) name.href = 'https://www.twitch.tv/' + message.login;
  name.target = '_blank'; name.rel = 'noopener noreferrer';
  name.className = 'name';
  if (['fossabot','blammobot'].includes(message.login.toLowerCase())) name.classList.add('shimmer');
  name.textContent = message.tags['display-name'] || message.login || message.command.toLowerCase();
  name.style.color = readableColor(message.tags.color ?? '', document.documentElement.dataset.theme === 'light');
  const text = messageText(message, metadata, frozen);
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
  const badges = document.createElement('span');
  badges.className = 'badges';
  for (const entry of (message.tags.badges ?? '').split(',')) {
    const [set, version] = entry.split('/');
    if (!set || !version) continue;
    const badge = metadata?.badges[set]?.[version];
    if (badge) {
      const image = document.createElement('img');
      image.className = 'badge';
      image.src = badge.url;
      image.alt = `[${badge.title || set}]`;
      image.title = [badge.title || set, badge.description].filter(Boolean).join(' · ');
      image.addEventListener('error', () => image.replaceWith(document.createTextNode(`[${set}]`)), { once: true });
      badges.append(image);
    } else {
      const chip = document.createElement('span');
      chip.className = 'badge-fallback';
      chip.textContent = `[${set}]`;
      badges.append(chip);
    }
  }
  row.append(time, channel);
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
  if (message.command === 'CLEARMSG') text.textContent = 'Message deleted';
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
  return row;
}
