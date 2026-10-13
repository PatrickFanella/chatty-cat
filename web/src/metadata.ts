import type { Emote } from './tokens';

export interface Badge { url: string; title: string; description: string }
export type Provider = '7TV'|'BTTV'|'FFZ'|'Twitch';
export interface EmoteSet {provider:Provider;scope:'global'|'channel';emotes:Record<string,Emote>}
export interface ChannelMetadata {
  emoteSets?:EmoteSet[];
  channel: string;
  emotes: Record<string, Emote>;
  badges: Record<string, Record<string, Badge>>;
  stream: { uptime: string; viewers: string; title: string; game?:string };
  errors: string[];
  lastVod?:{start:string;end:string;url:string;title:string};
  emoteUse?:Record<string,number>;
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function image(value: unknown): value is string {
  if (typeof value !== 'string' || value.length>2048 || /[\x00-\x20\x7f]/.test(value)) return false;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; }
  catch { return false; }
}

function parseEmotes(value:unknown,limit=16384):Record<string,Emote>|null {
 if(!object(value)||Object.keys(value).length>limit)return null;
  const emotes: Record<string, Emote> = Object.create(null) as Record<string, Emote>;
  for (const [code, e] of Object.entries(value)) {
    if (!code || code.length>100 || /\s/.test(code) || !object(e) || e.code !== code || !image(e.url) || typeof e.staticUrl !== 'string'
      || (e.staticUrl !== '' && !image(e.staticUrl)) || typeof e.source !== 'string' || e.source.length>40
      || typeof e.animated !== 'boolean' || typeof e.zeroWidth !== 'boolean') return null;
    emotes[code] = { code, url: e.url, staticUrl: e.staticUrl, source: e.source,
      animated: e.animated, zeroWidth: e.zeroWidth };
  }
 return emotes;
}
export function parseMetadata(value: unknown): ChannelMetadata | null {
  if (!object(value) || typeof value.channel !== 'string' || !/^[a-z0-9_]{1,25}$/.test(value.channel)
    || !object(value.emotes) || !object(value.badges) || !object(value.stream)
    || !Array.isArray(value.errors) || value.errors.length>64 || !value.errors.every((error: unknown) => typeof error === 'string' && error.length<=300)) return null;
  const emotes=parseEmotes(value.emotes);if(!emotes)return null;
  let emoteSets:EmoteSet[]|undefined;
  if(value.emoteSets!==undefined){
    if(!Array.isArray(value.emoteSets)||value.emoteSets.length>8)return null;
    emoteSets=[];const seen=new Set<string>();
    for(const set of value.emoteSets){
      if(!object(set)||(set.provider!=='7TV'&&set.provider!=='BTTV'&&set.provider!=='FFZ'&&set.provider!=='Twitch')||(set.scope!=='global'&&set.scope!=='channel'))return null;
      const key=set.provider+set.scope,entries=parseEmotes(set.emotes,2048);if(seen.has(key)||!entries||Object.values(entries).some(e=>e.source!==set.provider&&!(set.provider==='FFZ'&&e.source==='FFZ animated')))return null;
      seen.add(key);emoteSets.push({provider:set.provider,scope:set.scope,emotes:entries});
    }
  }
  const badges: Record<string, Record<string, Badge>> = Object.create(null) as Record<string, Record<string, Badge>>;
  if(Object.keys(value.badges).length>256)return null;
  for (const [set, versions] of Object.entries(value.badges)) {
    if (!set || set.length>100 || !object(versions) || Object.keys(versions).length>256) return null;
    const parsed: Record<string, Badge> = Object.create(null) as Record<string, Badge>;
    for (const [version, badge] of Object.entries(versions)) {
      if (!version || version.length>100 || !object(badge) || !image(badge.url) || typeof badge.title !== 'string' || typeof badge.description !== 'string' || badge.title.length>300 || badge.description.length>1000) return null;
      parsed[version] = { url: badge.url, title: badge.title, description: badge.description };
    }
    badges[set] = parsed;
  }
  const emoteUse:Record<string,number>=Object.create(null) as Record<string,number>;if(value.emoteUse!==undefined){if(!object(value.emoteUse))return null;for(const [code,count] of Object.entries(value.emoteUse).slice(0,4096)){if(code.length>100||typeof count!=='number'||!Number.isSafeInteger(count)||count<0)return null;emoteUse[code]=count;}}
  let lastVod:ChannelMetadata['lastVod'];if(value.lastVod!==undefined){const vod=value.lastVod;if(!object(vod)||typeof vod.start!=='string'||typeof vod.end!=='string'||typeof vod.url!=='string'||typeof vod.title!=='string'||!/^https:\/\/www\.twitch\.tv\/videos\/[0-9]{1,30}$/.test(vod.url))return null;const start=Date.parse(vod.start),end=Date.parse(vod.end);if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>604800000)return null;lastVod={start:vod.start,end:vod.end,url:vod.url,title:vod.title.slice(0,300)};}
  const stream = value.stream;
  if (typeof stream.uptime !== 'string' || typeof stream.viewers !== 'string' || typeof stream.title !== 'string' || stream.title.length>1000 || stream.uptime.length>500 || stream.viewers.length>100 || stream.game!==undefined&&(typeof stream.game!=='string'||stream.game.length>500)) return null;
  return { channel: value.channel, emotes, ...(emoteSets?{emoteSets}:{}), badges, emoteUse, ...(lastVod?{lastVod}:{}), stream: { uptime: stream.uptime, viewers: stream.viewers, title: stream.title, ...(typeof stream.game==='string'?{game:stream.game}:{}) }, errors: value.errors as string[] };
}

export class MetadataClient {
  private abort = new AbortController();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private generation=0;
  private stopped=false;

  constructor(private channels: string[], private readonly receive: (data: ChannelMetadata) => void,
    private readonly failure: (channel: string) => void) {}

  private lastRefresh=-Infinity;
  start(): void { void this.poll(); }
  refresh():boolean{if(this.stopped||Date.now()-this.lastRefresh<30000)return false;this.lastRefresh=Date.now();this.generation++;this.abort.abort();this.abort=new AbortController();if(this.timer!==null)clearTimeout(this.timer);this.timer=null;void this.poll();return true;}
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
        if(Number(res.headers.get('content-length')??0)>8*1024*1024)throw new Error('Metadata exceeds limit');
        const reader=res.body?.getReader();if(!reader)throw new Error('Missing metadata body');
        const chunks:Uint8Array[]=[];let size=0;
        try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>8*1024*1024)throw new Error('Metadata exceeds limit');chunks.push(value);}}finally{await reader.cancel();}
        const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
        const value:unknown=JSON.parse(new TextDecoder().decode(bytes));
        const data = parseMetadata(value);
        if (!data || data.channel !== channel) throw new Error('invalid metadata');
        if (!abort.signal.aborted&&generation===this.generation&&!this.stopped) this.receive(data);
      } catch { if (!abort.signal.aborted&&generation===this.generation&&!this.stopped) this.failure(channel); }
    }};
    await Promise.all(Array.from({length:Math.min(4,channels.length)},()=>worker()));
    if (!abort.signal.aborted&&generation===this.generation&&!this.stopped) this.timer = setTimeout(() => void this.poll(), 60000);
  }
}
