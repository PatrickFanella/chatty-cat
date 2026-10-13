import {completionDefaults,type CompletionPreferences} from './completion-preferences';
export interface Candidate { value: string; kind: 'nickname' | 'emote' | 'command';label?:string }
export interface Completion { start: number; end: number; items: Candidate[] }

// Caret offsets are UTF-16, matching textarea selectionStart/selectionEnd.
export function completions(text: string, start: number, end: number, names: readonly string[], emotes: readonly string[], bare = false, commands:readonly string[]=[],options:CompletionPreferences=completionDefaults): Completion | undefined {
  if (start !== end || start < 0 || start > text.length || text.length>4096) return undefined;
  if(typeof Intl.Segmenter==='function'&&![0,...[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)].map(s=>s.index+s.segment.length)].includes(start))return undefined;
  const word = text.slice(0, start).match(/\S*$/)?.[0] ?? '';
  if (!word) return undefined;
  const command=start-word.length===0&&word.startsWith('/')&&commands.length>0;
  const nickname = word.startsWith('@');
  const colon = word.startsWith(':');
  if(colon&&!options.emoteWithColon||nickname&&!bare&&!options.usernameMenu)return undefined;
  if (!nickname && !colon && !command && (!bare || word.length < 3)) return undefined;
  const prefix = (nickname || colon ? word.slice(1) : word).toLowerCase();
  if (!prefix) return undefined;
  const priority=new Map((options.smartEmotes?options.emotePriority:[]).map((code,i)=>[code.toLowerCase(),i])),aliases=new Map(options.aliases.map(x=>[x.login,x.alias]));
  const pools:Candidate[]=command?commands.slice(0,100).map(value=>({value,kind:'command'})):nickname?names.slice(0,10000).map(value=>({value,kind:'nickname'})):[...emotes.slice(0,10000).map((value):Candidate=>({value,kind:'emote'})),...bare&&options.bareNames?names.slice(0,10000).map((value):Candidate=>({value,kind:'nickname'})):[]];
  function score(value:string):number{const lower=value.toLowerCase();if(lower.startsWith(prefix))return 0;if(options.mode!=='fuzzy')return Infinity;let index=0;for(const char of prefix){const next=lower.indexOf(char,index);if(next<0)return Infinity;index=next+1;}return 1;}
  const seen=new Set<string>();const ranked=pools.flatMap(item=>{
   const id=item.kind+':'+item.value;if(seen.has(id)||!item.value||item.value.length>100)return [];seen.add(id);
   const alias=item.kind==='nickname'?aliases.get(item.value.toLowerCase()):undefined,rank=Math.min(score(item.value),alias?score(alias):Infinity);if(!Number.isFinite(rank))return [];
   return [{item:{...item,value:item.kind==='nickname'?(options.mentionAt?'@':'')+item.value:item.value,...alias?{label:alias+' · '+item.value}:{}},rank,priority:item.kind==='emote'?priority.get(item.value.toLowerCase())??65:66}];
  });
  const items=ranked.sort((a,b)=>a.rank-b.rank||a.priority-b.priority||a.item.value.toLowerCase().localeCompare(b.item.value.toLowerCase())).slice(0,30).map(x=>x.item);
  return items.length ? { start: start - word.length, end: start, items } : undefined;
}

export function insertCompletion(text: string, completion: Completion, index: number,options:CompletionPreferences=completionDefaults): { text: string; caret: number } {
  const item=completion.items[index],value=item?.value;
  if (!value) return { text, caret: completion.end };
  const suffix = text.slice(completion.end);
  const comma=item?.kind==='nickname'&&options.mentionComma&&!suffix.startsWith(',')?',':'';
  const insert = value+comma + (options.appendSpace&&!suffix.startsWith(' ')&&!suffix.startsWith(',') ? ' ' : '');
  return { text: text.slice(0, completion.start) + insert + suffix, caret: completion.start + insert.length };
}

// Twitch sends a single chat line. Preserve the draft's layout until submission.
export function wireMessage(text: string): string { return text.replace(/[\r\n]+/g, ' ').trim(); }
