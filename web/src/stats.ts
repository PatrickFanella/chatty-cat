import {StatisticsStorageControls} from './stats-storage-ui';
import {profileKey} from './account-profiles';
import { privacyEnabled } from './privacy';
import {badgeGroups,renderBadgeReference} from './stats-badges';
import type {ChannelMetadata} from './metadata';
import {registerSettings} from './settings-bundle';
import {type StatsLedger,type StatKind} from './stats-ledger';
import { isGlorp, type RateSeries } from './rate-timeline';
import type { StreamHistory } from './stream-history';
import type { ChatMessage } from './protocol';
import { findLinks } from './links';
import { tokenize, type Emote } from './tokens';
import { gapBuckets } from './chat-gaps';
import { loudestBursts, type Burst } from './bursts';
export interface Rank { name: string; count: number }
export interface Stats { messages: number; glorps: number; glorpers: Rank[]; chatters: number; perMinute: number; peakPerMinute: number; buckets: number[]; gaps: boolean[]; pageGaps: boolean[]; bursts: Burst[]; users: Rank[]; emotes: Rank[]; badges: Rank[]; links: Rank[]; hours: Rank[]; days: Rank[] }
export function summarize(messages: readonly ChatMessage[], now: number, windowMs: number, channel: string, excluded: ReadonlySet<string>, emotes: (channel: string) => Record<string, Emote>): Stats {
  const maps = { users: new Map<string, number>(), glorpers: new Map<string, number>(), emotes: new Map<string, number>(), badges: new Map<string, number>(), links: new Map<string, number>(), hours: new Map<string, number>(), days: new Map<string, number>() };
  const buckets = Array<number>(60).fill(0); const minute = new Map<number, number>(); const seen = new Set<string>(); let count = 0; let glorps = 0;
  const increment = <K>(map: Map<K, number>, key: K): void => { map.set(key, (map.get(key) ?? 0) + 1); };
  const from = now - windowMs;
  const included: ChatMessage[] = [];
  for (const message of messages) {
    if (message.command !== 'PRIVMSG' || message.timestamp < from || message.timestamp > now || (channel && message.channel !== channel) || excluded.has(message.login.toLowerCase())) continue;
    const key = message.channel + ':' + message.id; if (message.id && seen.has(key)) continue; if (message.id) seen.add(key);
    included.push(message);
    count++; if(isGlorp(message)){glorps++;increment(maps.glorpers,message.login);} increment(maps.users, message.login); increment(minute, Math.floor(message.timestamp / 60000));
    const bin = Math.min(59, Math.floor((message.timestamp - from) / windowMs * 60)); buckets[bin] = (buckets[bin] ?? 0) + 1;
    for (const token of tokenize(message.text, message.tags.emotes ?? '', emotes(message.channel),false,/^[1-9][0-9]*$/.test(message.tags.bits??''))) if (token.type === 'emote') increment(maps.emotes, token.emote.code);
    for (const badge of (message.tags.badges ?? '').split(',')) { const name = badge.split('/')[0]; if (name) increment(maps.badges, name); }
    for (const link of findLinks(message.text)) increment(maps.links, new URL(link.href).hostname);
    const date = new Date(message.timestamp); increment(maps.hours, String(date.getHours()).padStart(2, '0') + ':00'); increment(maps.days, date.toLocaleDateString());
  }
  const ranks = (map: Map<string, number>): Rank[] => [...map].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 50);
  return { messages: count, glorps, glorpers:ranks(maps.glorpers), chatters: maps.users.size, perMinute: count / (windowMs / 60000), peakPerMinute: Math.max(0, ...minute.values()), buckets, gaps: gapBuckets(messages, now, windowMs), pageGaps: gapBuckets(messages, now, windowMs, 60, 'page'), bursts: loudestBursts(included, messages, now),
    users: ranks(maps.users), emotes: ranks(maps.emotes), badges: ranks(maps.badges), links: ranks(maps.links), hours: ranks(maps.hours), days: ranks(maps.days) };
}
export function rateGraph(buckets: readonly number[], label: string, gaps: readonly boolean[] = [], unit = 'messages', pageGaps: readonly boolean[] = []): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg'; const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 300 40'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label);
  if (gaps.some(Boolean)) svg.setAttribute('aria-label', label + ' · Observation gaps; counts may be incomplete');
  gaps.slice(0,buckets.length).forEach((gap,i)=>{if(!gap)return;const band=document.createElementNS(ns,'rect');band.classList.add('graph-gap');if(pageGaps[i])band.classList.add('graph-page-gap');band.setAttribute('x',String(i*300/buckets.length));band.setAttribute('y','0');band.setAttribute('width',String(300/buckets.length));band.setAttribute('height','40');band.setAttribute('fill',pageGaps[i]?'#a474df':'#e65b6c');band.setAttribute('opacity','.35');const title=document.createElementNS(ns,'title');title.textContent=pageGaps[i]?'Page closed or inactive; available backfill may be incomplete':'Connection interrupted; available backfill may be incomplete';band.append(title);svg.append(band);});
  const peak = Math.max(1, ...buckets); buckets.forEach((count, i) => { const bar = document.createElementNS(ns, 'rect'); const height = count / peak * 36; bar.setAttribute('x', String(i * 300 / buckets.length)); bar.setAttribute('y', String(40 - height)); bar.setAttribute('width', String(Math.max(1, 300 / buckets.length - 1))); bar.setAttribute('height', String(height)); bar.setAttribute('fill', 'currentColor'); const title = document.createElementNS(ns, 'title'); title.textContent = `${count} ${unit}`; bar.append(title); svg.append(bar); }); return svg;
}
export class StatsPanel {
  private bundleDispose:()=>void;
  private storageControls:StatisticsStorageControls|undefined;
  private timer: ReturnType<typeof setInterval>;
  private scope: HTMLSelectElement;
  private channel: HTMLSelectElement;
  private exclusions: HTMLInputElement;
  private badgeOrder:HTMLSelectElement;
  constructor(private dialog: HTMLDialogElement, private trigger: HTMLButtonElement, private header: HTMLElement, private messages: () => readonly ChatMessage[], private emotes: (channel: string) => Record<string, Emote>, channels: string[],private timeline?:RateSeries,private ledger?:StatsLedger,private seeds:(channel:string)=>Record<string,number>=()=>({}),private streams?:StreamHistory,private badges:(channel:string)=>ChannelMetadata['badges']=()=>({})) {
    if(ledger&&typeof indexedDB!=='undefined')this.storageControls=new StatisticsStorageControls(dialog);
    this.badgeOrder=dialog.querySelector<HTMLSelectElement>('#stats-badge-order')!;
    this.scope = dialog.querySelector<HTMLSelectElement>('#stats-scope')!; this.channel = dialog.querySelector<HTMLSelectElement>('#stats-channel')!; this.exclusions = dialog.querySelector<HTMLInputElement>('#stats-exclusions')!;
    for (const channel of channels) { const option = document.createElement('option'); option.value = channel; option.textContent = '#' + channel; this.channel.append(option); }
    try { const saved: unknown = JSON.parse(localStorage.getItem(profileKey('chatthing:v1:stats')) ?? 'null'); if (saved && typeof saved === 'object') { const data = saved as Record<string, unknown>; if(data.badgeOrder==='versions'||data.badgeOrder==='name')this.badgeOrder.value=data.badgeOrder; if(typeof data.channel==='string'&&[...this.channel.options].some(option=>option.value===data.channel))this.channel.value=data.channel; if (typeof data.excluded === 'string') this.exclusions.value = data.excluded.slice(0, 500); if(data.windows&&typeof data.windows==='object')for(const select of dialog.querySelectorAll<HTMLSelectElement>('[data-stat-kind]')){const value=(data.windows as Record<string,unknown>)[select.dataset.statKind!];if(typeof value==='string'&&[...select.options].some(option=>option.value===value))select.value=value;} if (typeof data.scope === 'string' && [...this.scope.options].some(o => o.value === data.scope)) this.scope.value = data.scope; } } catch { /* optional storage */ }
    trigger.addEventListener('click', this.open); dialog.querySelector('#stats-close')?.addEventListener('click', this.close); dialog.addEventListener('close', this.closed); dialog.addEventListener('change', this.change);
    this.bundleDispose=registerSettings('stats',()=>({open:this.dialog.open,badgeOrder:this.badgeOrder.value,scope:this.scope.value,channel:this.channel.value,excluded:this.exclusions.value,windows:Object.fromEntries([...this.dialog.querySelectorAll<HTMLSelectElement>('[data-stat-kind]')].map(select=>[select.dataset.statKind,select.value]))}),value=>{if(!value||typeof value!=='object')return;const data=value as Record<string,unknown>;if(data.badgeOrder==='versions'||data.badgeOrder==='name')this.badgeOrder.value=data.badgeOrder;for(const [select,key] of [[this.scope,'scope'],[this.channel,'channel']] as const){if(typeof data[key]==='string'&&[...select.options].some(option=>option.value===data[key]))select.value=data[key];}if(typeof data.excluded==='string')this.exclusions.value=data.excluded.slice(0,500);if(data.windows&&typeof data.windows==='object')for(const select of this.dialog.querySelectorAll<HTMLSelectElement>('[data-stat-kind]')){const choice=(data.windows as Record<string,unknown>)[select.dataset.statKind!];if(typeof choice==='string'&&[...select.options].some(option=>option.value===choice))select.value=choice;}this.change();if(this.dialog.dataset.rail!=='true'){if(data.open===true&&!this.dialog.open)this.open();else if(data.open===false&&this.dialog.open)this.dialog.close();}});
    let ticks=0;this.timer = setInterval(()=>{this.paint();if(++ticks%6===0)this.ledger?.save();}, 5000); this.paint();
  }
  float():void {this.dialog.removeAttribute('open');this.open();}
  showRail(open:boolean):void {if(open){if(this.dialog.open)this.dialog.close();this.dialog.setAttribute('open','');this.paint();}else this.dialog.removeAttribute('open');}
  private open = (): void => { if(privacyEnabled())return; this.dialog.showModal(); this.paint(); };
  private close = (): void => this.dialog.close();
  private closed = (): void => { this.trigger.focus(); };
  private change = (): void => { try { localStorage.setItem(profileKey('chatthing:v1:stats'), JSON.stringify({ badgeOrder:this.badgeOrder.value,scope: this.scope.value, channel:this.channel.value, excluded: this.exclusions.value,windows:Object.fromEntries([...this.dialog.querySelectorAll<HTMLSelectElement>('[data-stat-kind]')].map(select=>[select.dataset.statKind,select.value])) })); } catch { /* optional storage */ } this.paint(); };
  private paint = (): void => {
    const now = Date.now(); const excluded = new Set(this.exclusions.value.toLowerCase().split(/[\s,]+/).filter(Boolean));
    const stats = this.timeline?undefined:summarize(this.messages(), now, 60000, '', excluded, this.emotes);
    if(stats)this.header.replaceChildren(rateGraph(stats.buckets, `Last minute: ${stats.messages} messages from ${stats.chatters} chatters`)); if(stats)this.header.title = `${stats.messages}/min · ${stats.chatters} chatters`;
    if (!this.dialog.open) return;
    const windowMs = Number(this.scope.value); const data = summarize(this.messages(), now, windowMs, this.channel.value, excluded, this.emotes);
    const summary = this.dialog.querySelector<HTMLElement>('#stats-summary')!; summary.textContent = `${data.messages.toLocaleString()} messages · ${data.glorps.toLocaleString()} glorp/F · ${data.chatters.toLocaleString()} chatters · ${data.perMinute.toFixed(1)}/min · peak minute ${data.peakPerMinute}`;
    const graph = this.dialog.querySelector<HTMLElement>('#stats-graph')!; graph.replaceChildren(rateGraph(data.buckets, 'Message count over the selected time window', data.gaps, 'messages', data.pageGaps));
    const body = this.dialog.querySelector<HTMLElement>('#stats-lists')!;
    // Keep keyboard focus stable while an expanded badge reference is being read.
    if(body.contains(document.activeElement))return;
    const expanded=new Set([...body.querySelectorAll<HTMLDetailsElement>('details[open][data-badge-set]')].map(details=>details.dataset.badgeSet!)); body.replaceChildren();
    if (this.streams) {
      const channels = this.channel.value ? [this.channel.value] : [...this.channel.options].map(option => option.value).filter(Boolean);
      for (const channel of channels) {
        const section = document.createElement('section'), heading = document.createElement('h3'); heading.textContent = 'Stream history · #' + channel; section.append(heading);
        const samples = this.streams.samples(channel, now - windowMs), peak = this.streams.peak(channel, now - windowMs);
        if (peak) { const value = document.createElement('p'); value.textContent = `Peak observed viewers: ${peak.viewers.toLocaleString()} at ${new Date(peak.at).toLocaleString()}`; section.append(value); }
        const list = document.createElement('ol');
        for (const sample of samples.slice(-30).reverse()) { const item = document.createElement('li'); item.textContent = new Date(sample.at).toLocaleString() + ' · ' + (sample.live ? 'Live' : 'Observed offline') + (sample.viewers === null ? '' : ' · ' + sample.viewers.toLocaleString() + ' viewers') + (sample.title ? ' · ' + sample.title : ''); list.append(item); }
        if (!samples.length) { const item = document.createElement('li'); item.textContent = 'No stream observations in this window'; list.append(item); } section.append(list);
        for (const vod of this.streams.archives(channel)) { const link = document.createElement('a'); link.href = vod.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = (vod.title || 'Archive') + ' · ' + new Date(vod.start).toLocaleString() + ' → ' + new Date(vod.end).toLocaleString(); const item = document.createElement('p'); item.append(link); section.append(item); }
        body.append(section);
      }
      if (this.streams.storageFailed) { const note = document.createElement('p'); note.textContent = 'Stream history could not be saved in this browser'; body.append(note); }
    }
    if(this.timeline){
      for(const kind of ['rate','glorps'] as const){
        const section=document.createElement('section'),heading=document.createElement('h3');
        heading.textContent=kind==='rate'?'Observed message bursts (last 24 hours)':'Observed glorp/F spikes (last 24 hours)';section.append(heading);
        const list=document.createElement('ol');
        for(const peak of this.timeline.peaks(now,this.channel.value,86400,kind)){
          const item=document.createElement('li'),time=document.createElement('span');
          time.textContent=new Date(peak.second*1000).toLocaleString();
          item.append((kind==='rate'?peak.rate.toFixed(1)+' msgs/s':peak.glorps+' glorp/F per second')+' · ',time);
          if(this.channel.value){const link=document.createElement('a');const url=new URL('https://tv.supa.sh/logs');url.searchParams.set('c',this.channel.value);url.searchParams.set('d',new Date(peak.second*1000).toISOString().slice(0,10));link.href=url.href;link.textContent=' · day in chat logs';link.target='_blank';link.rel='noopener noreferrer';item.append(link);}
          list.append(item);
        }
        if(!list.childElementCount){const item=document.createElement('li');item.textContent='None observed';list.append(item);}section.append(list);body.append(section);
      }
    }
    if(this.ledger){
     const note=document.createElement('p');note.textContent=(this.ledger.storageLoading?'Loading saved observed totals…':'Observed totals since '+new Date(this.ledger.since).toLocaleString())+(this.ledger.limited?' · Aggregate capacity reached; some new keys or buckets were omitted':'')+(this.ledger.storageFailed?' · Counts could not be saved in this browser':'');body.append(note);
     for(const kind of ['users','emotes','badges','links'] as StatKind[]){const control=this.dialog.querySelector<HTMLSelectElement>('[data-stat-kind="'+kind+'"]');const hours=Number(control?.value??(kind==='users'?'24':'3'));let rows=this.ledger.ranks(kind,Number.isFinite(hours)?hours:0,this.channel.value,new Set([...excluded,'fossabot','blammobot']),now);
      if(kind==='emotes'&&control?.value==='se'){const totals=new Map<string,number>();for(const channel of this.channel.value?[this.channel.value]:[...this.channel.options].map(option=>option.value).filter(Boolean))for(const [name,count] of Object.entries(this.seeds(channel)))totals.set(name,(totals.get(name)??0)+count);rows=[...totals].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name)).slice(0,50);}
      const section=document.createElement('section'),heading=document.createElement('h3');heading.textContent={users:'Top chatters',emotes:'Top emotes',badges:'Badge versions',links:'Top links'}[kind];section.append(heading);const list=document.createElement('ol');for(const row of rows){const item=document.createElement('li');if(kind==='links'){const link=document.createElement('a');link.href=row.name;link.textContent=row.name;link.target='_blank';link.rel='noopener noreferrer';item.append(link,' · '+row.count.toLocaleString());}else item.textContent=row.name+' · '+row.count.toLocaleString();list.append(item);}if(!rows.length){const item=document.createElement('li');item.textContent='None recorded';list.append(item);}section.append(list);body.append(section);
     }
    }
    if(this.ledger){
      for(const unit of ['hours','days'] as const){
        const section=document.createElement('section'),heading=document.createElement('h3');heading.textContent=unit==='hours'?'Hourly messages (7 days, UTC)':'Daily messages (31 days, UTC)';section.append(heading);
        const list=document.createElement('ol');for(const row of this.ledger.buckets(unit,this.channel.value,excluded,now)){const item=document.createElement('li');item.textContent=new Date(row.at).toISOString().slice(0,unit==='hours'?13:10)+(unit==='hours'?':00':'')+' · '+row.count.toLocaleString();list.append(item);}if(!list.childElementCount){const item=document.createElement('li');item.textContent='None recorded';list.append(item);}section.append(list);body.append(section);
      }
    }
    const badgeChannels=this.channel.value?[this.channel.value]:[...this.channel.options].map(option=>option.value).filter(Boolean);
    const badgeHours=Number(this.dialog.querySelector<HTMLSelectElement>('[data-stat-kind="badges"]')?.value??3);
    body.append(renderBadgeReference(badgeGroups(badgeChannels.map(channel=>this.badges(channel)),this.ledger?.ranks('badges',Number.isFinite(badgeHours)?badgeHours:0,this.channel.value,excluded,now,20000)??[],this.badgeOrder.value==='name'?'name':'versions'),expanded));
    for (const [title, rows] of [['Users', data.users], ['Top glorpers',data.glorpers], ['Emotes', data.emotes], ['Badges', data.badges], ['Link domains', data.links], ['Hours', data.hours], ['Days', data.days]] as const) {
      const section = document.createElement('section'); const heading = document.createElement('h3'); heading.textContent = this.ledger?title+' (retained rows)':title; section.append(heading); const list = document.createElement('ol');
      for (const row of rows) { const item = document.createElement('li'); item.textContent = `${row.name} · ${row.count.toLocaleString()}`; list.append(item); } section.append(list); body.append(section);
    }
  };
  stop(): void { this.storageControls?.stop(); this.bundleDispose(); clearInterval(this.timer); this.trigger.removeEventListener('click', this.open); this.dialog.querySelector('#stats-close')?.removeEventListener('click', this.close); this.dialog.removeEventListener('close', this.closed); this.dialog.removeEventListener('change', this.change); }
}
