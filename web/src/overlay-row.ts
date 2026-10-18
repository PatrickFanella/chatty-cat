import type { ChatMessage } from './protocol';
import type { ChannelMetadata } from './metadata';
import { getPresentation, formatTimestamp, usernameLabel } from './presentation';
import { tokenize, stackCheerTokens } from './tokens';
import { configureEmoteAnimation, fallbackEmoteAnimation } from './emote-animation';
import { getProviderPreferences, showBadge } from './provider-preferences';
export function overlayRow(
  message: ChatMessage,
  metadata: ChannelMetadata | undefined,
  frozen: boolean,
  removed: boolean,
  historical: boolean,
): HTMLElement {
  const p = getPresentation(),
    prefs = getProviderPreferences(),
    row = document.createElement('article');
  row.className = 'row';
  Object.assign(row.dataset, {
    id: message.id,
    channel: message.channel,
    login: message.login,
    command: message.command,
    timestamp: String(message.timestamp),
  });
  row.classList.toggle('removed', removed);
  row.classList.toggle('history-message', historical);
  if (message.command !== 'PRIVMSG') row.classList.add('notice');
  const time = document.createElement('time');
  if (message.timestamp > 0) {
    const date = new Date(message.timestamp);
    time.dateTime = date.toISOString();
    const mode = Number(document.documentElement.dataset.times ?? 2);
    time.textContent =
      p.timestampFormat === 'legacy'
        ? date.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            ...(mode === 2 || mode === 4 ? { second: '2-digit' as const } : {}),
            hour12: mode === 3 || mode === 4,
          })
        : formatTimestamp(date, p.timestampFormat);
  }
  const channel = document.createElement('span');
  channel.className = 'channel';
  channel.textContent = '#' + message.channel;
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent =
    usernameLabel(message.login, message.tags['display-name'] ?? '', p.usernameMode) || message.command.toLowerCase();
  if (p.colorUsernames && /^#[a-f0-9]{6}$/i.test(message.tags.color ?? '')) name.style.color = message.tags.color!;
  const badges = document.createElement('span');
  badges.className = 'badges';
  for (const raw of (message.tags.badges ?? '').split(',')) {
    const [set, version] = raw.split('/');
    if (!set || !version || !showBadge(set)) continue;
    const badge = metadata?.badges[set]?.[version];
    if (!badge) {
      const label = document.createElement('span');
      label.className = 'badge-fallback';
      label.textContent = '[' + set + ']';
      badges.append(label);
      continue;
    }
    const img = document.createElement('img');
    img.className = 'badge';
    img.src = badge.url;
    img.alt = '[' + (badge.title || set) + ']';
    img.referrerPolicy = 'no-referrer';
    badges.append(img);
  }
  row.append(time, channel);
  const months = /(?:^|,)subscriber\/(\d+)(?:,|$)/.exec(message.tags['badge-info'] ?? '')?.[1];
  if (message.command === 'PRIVMSG') {
    const sub = document.createElement('span');
    sub.className = 'sub-months';
    sub.dataset.months = months ?? '--';
    const full = document.createElement('span');
    full.className = 'sub-full';
    full.textContent = '[sub ' + (months ?? '--') + ']';
    const compact = document.createElement('span');
    compact.className = 'sub-compact';
    compact.textContent = months ?? '--';
    sub.append(full, compact);
    row.append(sub);
  }
  row.append(badges, name, ': ');
  if (message.tags['reply-parent-msg-body'] && !p.hideReplyContext) {
    const quote = document.createElement('blockquote');
    quote.textContent =
      (message.tags['reply-parent-display-name'] ?? message.tags['reply-parent-user-login'] ?? '') +
      ': ' +
      message.tags['reply-parent-msg-body'];
    row.append(quote);
  }
  if (message.tags['system-msg']) {
    const system = document.createElement('span');
    system.className = 'system-message';
    system.textContent = message.tags['system-msg'];
    row.append(system, ' — ');
  }
  const body = document.createElement('span');
  body.className = 'message message-body';
  if (removed) {
    const chars = [...message.text];
    body.textContent = chars.slice(0, p.deletedLength).join('') + (chars.length > p.deletedLength ? '…' : '');
  } else if (message.command === 'CLEARCHAT')
    body.textContent = message.text
      ? message.text +
        (message.tags['ban-duration'] ? ' timed out for ' + message.tags['ban-duration'] + 's' : ' banned')
      : 'Chat cleared';
  else if (message.command === 'CLEARMSG') body.textContent = 'Message deleted';
  else {
    let tokens = tokenize(
      message.text,
      message.tags.emotes ?? '',
      metadata?.emotes ?? {},
      document.documentElement.dataset.theme === 'light',
      /^[1-9][0-9]*$/.test(message.tags.bits ?? ''),
    );
    if (prefs.stackBits) tokens = stackCheerTokens(tokens, Number(message.tags.bits));
    let stack: HTMLElement | undefined;
    for (const token of tokens) {
      if (token.type === 'text') {
        body.append(document.createTextNode(token.text));
        if (token.text.trim()) stack = undefined;
        continue;
      }
      const e = token.emote;
      if (!prefs.images) {
        body.append(e.code);
        continue;
      }
      if (e.zeroWidth && !prefs.zeroWidth) continue;
      if (!prefs.animated && e.animated && !e.staticUrl) {
        body.append(e.code);
        continue;
      }
      const img = document.createElement('img');
      img.className = 'emote';
      img.alt = e.code;
      img.title = e.code + ' · ' + e.source;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.dataset.emoteCode = e.code;
      img.dataset.emoteSource = e.source;
      if (prefs.scaleEmotesByLineHeight) img.classList.add('line-scaled');
      if (prefs.scale !== 1) img.style.setProperty('--emote-scale', String(prefs.scale));
      configureEmoteAnimation(img, e, frozen || !prefs.animated);
      img.addEventListener('error', () => {
        if (fallbackEmoteAnimation(img)) return;
        if (e.staticUrl && img.src !== e.staticUrl) img.src = e.staticUrl;
        else img.replaceWith(document.createTextNode(e.code));
      });
      if (e.zeroWidth && stack) {
        img.classList.add('overlay');
        stack.append(img);
      } else {
        stack = document.createElement('span');
        stack.className = 'emote-stack';
        stack.append(img);
        body.append(stack);
      }
    }
  }
  if (message.text.startsWith('\x01ACTION ') && message.text.endsWith('\x01')) row.classList.add('action');
  row.append(body);
  return row;
}
