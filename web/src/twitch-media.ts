import { twitchParent } from './video';
export interface TwitchMedia { kind: 'clip' | 'video'; id: string; time?: string }
export function twitchMedia(raw: string): TwitchMedia | undefined {
  try {
    const url = new URL(raw); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) return;
    const parts = url.pathname.split('/').filter(Boolean), slug = /^[a-zA-Z0-9_-]{1,100}$/;
    if (url.hostname === 'clips.twitch.tv' && parts.length === 1 && slug.test(parts[0]!)) return { kind: 'clip', id: parts[0]! };
    if (!['twitch.tv', 'www.twitch.tv'].includes(url.hostname)) return;
    if (parts.length === 3 && /^[a-z0-9_]{1,25}$/i.test(parts[0]!) && parts[1] === 'clip' && slug.test(parts[2]!)) return { kind: 'clip', id: parts[2]! };
    if (parts.length === 2 && parts[0] === 'videos' && /^[1-9][0-9]{0,18}$/.test(parts[1]!)) { const time = url.searchParams.get('t'); return { kind: 'video', id: parts[1]!, ...(time && /^(?:\d{1,3}h)?(?:\d{1,3}m)?(?:\d{1,3}s)?$/.test(time) ? {time} : {}) }; }
  } catch { /* ordinary external link */ }
}
export function twitchFrame(media: TwitchMedia, title: string): HTMLIFrameElement {
  const url = new URL(media.kind === 'clip' ? 'https://clips.twitch.tv/embed' : 'https://player.twitch.tv/');
  url.searchParams.set(media.kind === 'clip' ? 'clip' : 'video', media.kind === 'clip' ? media.id : 'v' + media.id);
  url.searchParams.set('parent', twitchParent(location.hostname)); url.searchParams.set('autoplay', 'false'); url.searchParams.set('muted', 'true');
  if (media.kind === 'video' && media.time) url.searchParams.set('time', media.time);
  const frame = document.createElement('iframe'); frame.src = url.href; frame.title = title || 'Twitch media'; frame.allow = 'autoplay; fullscreen'; frame.allowFullscreen = true; frame.width = '100%'; frame.height = '300'; frame.className = 'twitch-card-player'; return frame;
}
