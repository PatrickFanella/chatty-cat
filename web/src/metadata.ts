import type { Emote } from './tokens';

export interface Badge { url: string; title: string; description: string }
export interface ChannelMetadata {
  channel: string;
  emotes: Record<string, Emote>;
  badges: Record<string, Record<string, Badge>>;
  stream: { uptime: string; viewers: string; title: string };
  errors: string[];
  lastVod?:{start:string;end:string;url:string;title:string};
  emoteUse?:Record<string,number>;
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function image(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; }
  catch { return false; }
}

export function parseMetadata(value: unknown): ChannelMetadata | null {
  if (!object(value) || typeof value.channel !== 'string' || !/^[a-z0-9_]{1,25}$/.test(value.channel)
    || !object(value.emotes) || !object(value.badges) || !object(value.stream)
    || !Array.isArray(value.errors) || !value.errors.every((error: unknown) => typeof error === 'string')) return null;
  const emotes: Record<string, Emote> = Object.create(null) as Record<string, Emote>;
  for (const [code, e] of Object.entries(value.emotes)) {
    if (!object(e) || e.code !== code || !image(e.url) || typeof e.staticUrl !== 'string'
      || (e.staticUrl !== '' && !image(e.staticUrl)) || typeof e.source !== 'string'
      || typeof e.animated !== 'boolean' || typeof e.zeroWidth !== 'boolean') return null;
    emotes[code] = { code, url: e.url, staticUrl: e.staticUrl, source: e.source,
      animated: e.animated, zeroWidth: e.zeroWidth };
  }
  const badges: Record<string, Record<string, Badge>> = Object.create(null) as Record<string, Record<string, Badge>>;
  for (const [set, versions] of Object.entries(value.badges)) {
    if (!object(versions)) return null;
    const parsed: Record<string, Badge> = Object.create(null) as Record<string, Badge>;
    for (const [version, badge] of Object.entries(versions)) {
      if (!object(badge) || !image(badge.url) || typeof badge.title !== 'string' || typeof badge.description !== 'string') return null;
      parsed[version] = { url: badge.url, title: badge.title, description: badge.description };
    }
    badges[set] = parsed;
  }
  const emoteUse:Record<string,number>=Object.create(null) as Record<string,number>;if(value.emoteUse!==undefined){if(!object(value.emoteUse))return null;for(const [code,count] of Object.entries(value.emoteUse).slice(0,4096)){if(code.length>100||typeof count!=='number'||!Number.isSafeInteger(count)||count<0)return null;emoteUse[code]=count;}}
  let lastVod:ChannelMetadata['lastVod'];if(value.lastVod!==undefined){const vod=value.lastVod;if(!object(vod)||typeof vod.start!=='string'||typeof vod.end!=='string'||typeof vod.url!=='string'||typeof vod.title!=='string'||!/^https:\/\/www\.twitch\.tv\/videos\/[0-9]{1,30}$/.test(vod.url))return null;const start=Date.parse(vod.start),end=Date.parse(vod.end);if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>604800000)return null;lastVod={start:vod.start,end:vod.end,url:vod.url,title:vod.title.slice(0,300)};}
  const stream = value.stream;
  if (typeof stream.uptime !== 'string' || typeof stream.viewers !== 'string' || typeof stream.title !== 'string') return null;
  return { channel: value.channel, emotes, badges, emoteUse, ...(lastVod?{lastVod}:{}), stream: { uptime: stream.uptime, viewers: stream.viewers, title: stream.title }, errors: value.errors as string[] };
}

export class MetadataClient {
  private abort = new AbortController();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private generation=0;
  private stopped=false;

  constructor(private channels: string[], private readonly receive: (data: ChannelMetadata) => void,
    private readonly failure: (channel: string) => void) {}

  start(): void { void this.poll(); }
  stop(): void {this.stopped=true;this.generation++; this.abort.abort(); if (this.timer !== null) clearTimeout(this.timer); }
  setChannels(channels:readonly string[]):void{const next=[...new Set(channels)].sort();if(next.join(',')===[...this.channels].sort().join(',')||this.stopped)return;this.channels=next;this.generation++;this.abort.abort();this.abort=new AbortController();if(this.timer!==null)clearTimeout(this.timer);this.timer=null;void this.poll();}

  private async poll(): Promise<void> {
    const generation=this.generation,abort=this.abort,channels=[...this.channels];let index=0;
    const worker=async():Promise<void>=>{while(index<channels.length&&!abort.signal.aborted&&!this.stopped){const channel=channels[index++]!;
      try {
        const res = await fetch('/api/channels/' + encodeURIComponent(channel), {
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(25000)]),
        });
        if (!res.ok) throw new Error('metadata fetch failed');
        const value: unknown = await res.json();
        const data = parseMetadata(value);
        if (!data || data.channel !== channel) throw new Error('invalid metadata');
        if (!abort.signal.aborted&&generation===this.generation&&!this.stopped) this.receive(data);
      } catch { if (!abort.signal.aborted&&generation===this.generation&&!this.stopped) this.failure(channel); }
    }};
    await Promise.all(Array.from({length:Math.min(4,channels.length)},()=>worker()));
    if (!abort.signal.aborted&&generation===this.generation&&!this.stopped) this.timer = setTimeout(() => void this.poll(), 60000);
  }
}
