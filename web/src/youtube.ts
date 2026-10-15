export interface YouTubeVideo {
  id: string;
  start: number;
}
export function youtubeVideo(raw: string): YouTubeVideo | undefined {
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) return undefined;
    const host = url.hostname.replace(/^(?:www|m|music)\./, '');
    let id: string | undefined;
    if (host === 'youtu.be') id = url.pathname.match(/^\/([\w-]{11})\/?$/)?.[1];
    else if (['youtube.com', 'youtube-nocookie.com'].includes(host))
      id =
        url.pathname === '/watch'
          ? (url.searchParams.get('v') ?? undefined)
          : url.pathname.match(/^\/(?:shorts|live|embed|v)\/([\w-]{11})\/?$/)?.[1];
    if (!id || !/^[\w-]{11}$/.test(id)) return undefined;
    const rawTime = url.searchParams.get('t') || url.searchParams.get('start') || '',
      match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(rawTime);
    const seconds = match ? Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0) : 0;
    return { id, start: Number.isSafeInteger(seconds) ? Math.min(86400, seconds) : 0 };
  } catch {
    return undefined;
  }
}
export function youtubeFrame(video: YouTubeVideo, title: string): HTMLIFrameElement {
  const frame = document.createElement('iframe');
  frame.className = 'youtube-player';
  frame.src =
    'https://www.youtube-nocookie.com/embed/' + video.id + '?autoplay=0' + (video.start ? '&start=' + video.start : '');
  frame.title = title || 'YouTube video';
  frame.allow = 'fullscreen; encrypted-media; picture-in-picture';
  frame.allowFullscreen = true;
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  return frame;
}
