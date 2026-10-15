export interface SocialMedia {
  avatar: string;
  quote: string;
  photos: { url: string; alt: string }[];
  videos: { url: string; thumb: string; kind: 'video' | 'gif'; width: number; height: number }[];
}
function asset(raw: unknown, host: string): string {
  if (raw === '') return '';
  if (typeof raw !== 'string' || raw.length > 2048) throw new Error('Invalid social asset');
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.hostname !== host || url.username || url.password || url.port)
    throw new Error('Invalid social asset');
  return url.href;
}
export function parseSocial(value: unknown): SocialMedia | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object') throw new Error('Invalid social media');
  const data = value as Record<string, unknown>;
  if (
    typeof data.quote !== 'string' ||
    !Array.isArray(data.photos) ||
    data.photos.length > 4 ||
    !Array.isArray(data.videos) ||
    data.videos.length > 4
  )
    throw new Error('Invalid social media fields');
  const photos = data.photos.map((raw) => {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid photo');
    const item = raw as Record<string, unknown>;
    if (typeof item.alt !== 'string') throw new Error('Invalid alt text');
    const url = asset(item.url, 'pbs.twimg.com');
    if (!url) throw new Error('Missing photo URL');
    return { url, alt: item.alt.slice(0, 300) };
  });
  const videos = data.videos.map((raw): SocialMedia['videos'][number] => {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid video');
    const item = raw as Record<string, unknown>;
    if (
      (item.kind !== 'video' && item.kind !== 'gif') ||
      typeof item.width !== 'number' ||
      typeof item.height !== 'number' ||
      ![item.width, item.height].every((n) => Number.isSafeInteger(n) && n >= 0 && n <= 8192)
    )
      throw new Error('Invalid video dimensions');
    const url = asset(item.url, 'video.twimg.com');
    if (!url) throw new Error('Missing video URL');
    return { url, thumb: asset(item.thumb, 'pbs.twimg.com'), kind: item.kind, width: item.width, height: item.height };
  });
  return { avatar: asset(data.avatar, 'pbs.twimg.com'), quote: data.quote.slice(0, 1000), photos, videos };
}
export function appendSocial(root: HTMLElement, media: SocialMedia, images: boolean): void {
  if (media.quote) {
    const quote = document.createElement('blockquote');
    quote.textContent = media.quote;
    root.append(quote);
  }
  if (!images) return;
  if (media.avatar) {
    const avatar = document.createElement('img');
    avatar.className = 'social-avatar';
    avatar.src = media.avatar;
    avatar.alt = 'Author avatar';
    avatar.loading = 'lazy';
    avatar.referrerPolicy = 'no-referrer';
    avatar.addEventListener('error', () => avatar.remove(), { once: true });
    root.append(avatar);
  }
  for (const photo of media.photos) {
    const link = document.createElement('a');
    link.href = photo.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    const image = document.createElement('img');
    image.src = photo.url;
    image.alt = photo.alt;
    image.loading = 'lazy';
    image.referrerPolicy = 'no-referrer';
    image.className = 'social-photo';
    image.addEventListener('error', () => link.remove(), { once: true });
    link.append(image);
    root.append(link);
  }
  for (const video of media.videos) {
    const wrap = document.createElement('div');
    wrap.className = 'social-video';
    const play = document.createElement('button');
    play.type = 'button';
    play.textContent = video.kind === 'gif' ? 'Load animated GIF' : 'Load video';
    if (video.thumb) {
      const thumb = document.createElement('img');
      thumb.src = video.thumb;
      thumb.alt = 'Video thumbnail';
      thumb.loading = 'lazy';
      thumb.referrerPolicy = 'no-referrer';
      thumb.addEventListener('error', () => thumb.remove(), { once: true });
      play.prepend(thumb);
    }
    const source = document.createElement('a');
    source.href = video.url;
    source.textContent = 'Open media';
    source.target = '_blank';
    source.rel = 'noopener noreferrer';
    wrap.append(play, source);
    play.addEventListener(
      'click',
      () => {
        const player = document.createElement('video');
        player.src = video.url;
        player.controls = true;
        player.preload = 'none';
        player.playsInline = true;
        if (video.kind === 'gif') {
          player.loop = true;
          player.muted = true;
          player.defaultMuted = true;
        }
        const iframe = document.createElement('iframe');
        iframe.title = 'X / Twitter media player';
        iframe.referrerPolicy = 'no-referrer';
        iframe.setAttribute('sandbox', '');
        iframe.allow = 'fullscreen; picture-in-picture';
        iframe.allowFullscreen = true;
        if (video.width && video.height) iframe.style.aspectRatio = video.width + '/' + video.height;
        iframe.srcdoc =
          '<meta name="referrer" content="no-referrer"><style>html,body{margin:0;height:100%;background:#000}video{width:100%;height:100%;object-fit:contain}</style>' +
          player.outerHTML;
        play.replaceWith(iframe);
      },
      { once: true },
    );
    root.append(wrap);
  }
}
export function socialStatusURL(raw: string): string | undefined {
  try {
    const url = new URL(raw);
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      !['x.com', 'www.x.com', 'mobile.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'].includes(
        url.hostname,
      )
    )
      return undefined;
    const match = /^\/[A-Za-z0-9_]{1,15}\/status\/(\d{1,20})(?:\/(?:photo|video)\/[1-4])?\/?$/.exec(url.pathname);
    return match ? 'https://x.com' + url.pathname.replace(/\/(?:photo|video)\/[1-4]\/?$/, '') : undefined;
  } catch {
    return undefined;
  }
}
