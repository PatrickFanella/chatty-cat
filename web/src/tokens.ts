export interface Emote {
  code: string;
  unlisted?:boolean;
  url: string;
  staticUrl: string;
  source: string;
  animated: boolean;
  zeroWidth: boolean;
}
export type Token = { type: 'text'; text: string } | { type: 'emote'; emote: Emote };

function nativeEmote(id: string, code: string, light: boolean): Emote {
  const base = `https://static-cdn.jtvnw.net/emoticons/v2/${id}`;
  const tone = light ? 'light' : 'dark';
  return { code, url: `${base}/animated/${tone}/2.0`, staticUrl: `${base}/default/${tone}/2.0`,
    source: 'Twitch', animated: true, zeroWidth: false };
}

const CHEER_PREFIXES=new Set(['cheer','kappa','kreygasm','muxify','swiftloss','cheerwhal','corgo','scoody','uni','showlove','party','seemsgood','pride','punchbets','saltycorn','streamlabs','glitch','starcitizen','clap','anonsalute','tri','mrdestructoid']);
export function cheerEmote(word:string,light=false):Emote|undefined {
 const match=/^([a-z]+)([0-9]+)$/i.exec(word);if(!match||!CHEER_PREFIXES.has(match[1]!.toLowerCase()))return undefined;
 const amount=Number(match[2]);if(!Number.isSafeInteger(amount)||amount<1)return undefined;
 let tier=1;for(const value of [100,1000,5000,10000,100000])if(amount>=value)tier=value;
 const base=`https://d3aqoihi2n8ty8.cloudfront.net/actions/${match[1]!.toLowerCase()}/${light?'light':'dark'}`;
 return {code:word,url:`${base}/animated/${tier}/2.gif`,staticUrl:`${base}/static/${tier}/2.png`,source:'Cheer',animated:true,zeroWidth:false};
}

// Collapse only a complete, recognized cheer total; unknown/custom prefixes remain text.
export function stackCheerTokens(tokens:Token[],total:number,light=false):Token[]{
 if(!Number.isSafeInteger(total)||total<1)return tokens;
 const cheers=tokens.filter((t):t is Extract<Token,{type:'emote'}>=>t.type==='emote'&&t.emote.source==='Cheer');
 if(cheers.length<2)return tokens;
 const amounts=cheers.map(t=>Number(/^[a-z]+([0-9]+)$/i.exec(t.emote.code)?.[1]));
 if(amounts.some(n=>!Number.isSafeInteger(n)||n<1)||amounts.reduce((sum,n)=>sum+n,0)!==total)return tokens;
 const prefix=/^[a-z]+/i.exec(cheers[0]!.emote.code)?.[0],combined=prefix?cheerEmote(prefix+total,light):undefined;if(!combined)return tokens;
 let placed=false;return tokens.flatMap((t):Token[]=>{if(t.type!=='emote'||t.emote.source!=='Cheer')return [t];if(placed)return [];placed=true;return [{type:'emote',emote:combined}];});
}

// Twitch tag positions count Unicode code points, not JavaScript UTF-16 units.
// Native tag ranges take precedence over third-party names.
export function tokenize(text: string, tag: string, emotes: Record<string, Emote>, light = false, hasBits = false): Token[] {
  const action = text.startsWith('\x01ACTION ') && text.endsWith('\x01');
  const chars = [...(action ? text.slice(8, -1) : text)];
  const ranges: { start: number; end: number; id: string }[] = [];
  for (const group of tag.split('/')) {
    const [id, positions] = group.split(':');
    if (!id || !/^[a-zA-Z0-9_-]{1,100}$/.test(id) || !positions) continue;
    for (const position of positions.split(',')) {
      const match = /^(\d+)-(\d+)$/.exec(position);
      if (!match) continue;
      const start = Number(match[1]), end = Number(match[2]);
      if (start <= end && end < chars.length) ranges.push({ start, end, id });
    }
  }
  ranges.sort((a, b) => a.start - b.start);
  const tokens: Token[] = [];
  const textTokens = (part: string): void => {
    for (const word of part.split(/(\s+)/)) {
      if (!word) continue;
      const emote = Object.hasOwn(emotes, word) ? emotes[word] : hasBits?cheerEmote(word,light):undefined;
      if (emote) tokens.push({ type: 'emote', emote });
      else {
        const last = tokens.at(-1);
        if (last?.type === 'text') last.text += word;
        else tokens.push({ type: 'text', text: word });
      }
    }
  };
  let cursor = 0;
  for (const range of ranges) {
    if (range.start < cursor) continue;
    textTokens(chars.slice(cursor, range.start).join(''));
    tokens.push({ type: 'emote', emote: nativeEmote(range.id, chars.slice(range.start, range.end + 1).join(''), light) });
    cursor = range.end + 1;
  }
  textTokens(chars.slice(cursor).join(''));
  return tokens;
}

// Own API/IRC sends lack native ranges until the public echo arrives. Only the
// account's usable Twitch catalog may synthesize ranges for the local echo.
export function nativeEmoteTag(text: string, emotes: readonly Emote[]): string {
  const ids = new Map<string,string>();
  for (const emote of emotes) {
    if (emote.source !== 'Twitch') continue;
    const id = /^https:\/\/static-cdn\.jtvnw\.net\/emoticons\/v2\/([A-Za-z0-9_-]{1,128})\//.exec(emote.url)?.[1];
    if (id) ids.set(emote.code,id);
  }
  const inner = text.startsWith('\x01ACTION ') && text.endsWith('\x01') ? text.slice(8,-1) : text;
  const ranges = new Map<string,string[]>();
  for (const match of inner.matchAll(/\S+/gu)) {
    const id = ids.get(match[0]); if (!id) continue;
    const start = [...inner.slice(0,match.index)].length;
    const positions = ranges.get(id) ?? []; positions.push(`${start}-${start+[...match[0]].length-1}`); ranges.set(id,positions);
  }
  return [...ranges].map(([id,positions])=>id+':'+positions.join(',')).join('/');
}
