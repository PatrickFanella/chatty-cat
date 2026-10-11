import { isGlorp, type RateSeries } from './rate-timeline';
import type { ChatMessage } from './protocol';
import { findLinks } from './links';
import { tokenize, type Emote } from './tokens';
export interface Rank { name: string; count: number }
export interface Stats { messages: number; glorps: number; glorpers: Rank[]; chatters: number; perMinute: number; peakPerMinute: number; buckets: number[]; users: Rank[]; emotes: Rank[]; badges: Rank[]; links: Rank[]; hours: Rank[]; days: Rank[] }
export function summarize(messages: readonly ChatMessage[], now: number, windowMs: number, channel: string, excluded: ReadonlySet<string>, emotes: (channel: string) => Record<string, Emote>): Stats {
  const maps = { users: new Map<string, number>(), glorpers: new Map<string, number>(), emotes: new Map<string, number>(), badges: new Map<string, number>(), links: new Map<string, number>(), hours: new Map<string, number>(), days: new Map<string, number>() };
  const buckets = Array<number>(60).fill(0); const minute = new Map<number, number>(); const seen = new Set<string>(); let count = 0; let glorps = 0;
  const increment = <K>(map: Map<K, number>, key: K): void => { map.set(key, (map.get(key) ?? 0) + 1); };
  const from = now - windowMs;
  for (const message of messages) {
    if (message.command !== 'PRIVMSG' || message.timestamp < from || message.timestamp > now || (channel && message.channel !== channel) || excluded.has(message.login.toLowerCase())) continue;
    const key = message.channel + ':' + message.id; if (message.id && seen.has(key)) continue; if (message.id) seen.add(key);
    count++; if(isGlorp(message)){glorps++;increment(maps.glorpers,message.login);} increment(maps.users, message.login); increment(minute, Math.floor(message.timestamp / 60000));
    const bin = Math.min(59, Math.floor((message.timestamp - from) / windowMs * 60)); buckets[bin] = (buckets[bin] ?? 0) + 1;
    for (const token of tokenize(message.text, message.tags.emotes ?? '', emotes(message.channel),false,/^[1-9][0-9]*$/.test(message.tags.bits??''))) if (token.type === 'emote') increment(maps.emotes, token.emote.code);
    for (const badge of (message.tags.badges ?? '').split(',')) { const name = badge.split('/')[0]; if (name) increment(maps.badges, name); }
    for (const link of findLinks(message.text)) increment(maps.links, new URL(link.href).hostname);
    const date = new Date(message.timestamp); increment(maps.hours, String(date.getHours()).padStart(2, '0') + ':00'); increment(maps.days, date.toLocaleDateString());
  }
  const ranks = (map: Map<string, number>): Rank[] => [...map].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 50);
  return { messages: count, glorps, glorpers:ranks(maps.glorpers), chatters: maps.users.size, perMinute: count / (windowMs / 60000), peakPerMinute: Math.max(0, ...minute.values()), buckets,
    users: ranks(maps.users), emotes: ranks(maps.emotes), badges: ranks(maps.badges), links: ranks(maps.links), hours: ranks(maps.hours), days: ranks(maps.days) };
}
export function rateGraph(buckets: readonly number[], label: string): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg'; const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 300 40'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label);
  const peak = Math.max(1, ...buckets); buckets.forEach((count, i) => { const bar = document.createElementNS(ns, 'rect'); const height = count / peak * 36; bar.setAttribute('x', String(i * 300 / buckets.length)); bar.setAttribute('y', String(40 - height)); bar.setAttribute('width', String(Math.max(1, 300 / buckets.length - 1))); bar.setAttribute('height', String(height)); bar.setAttribute('fill', 'currentColor'); const title = document.createElementNS(ns, 'title'); title.textContent = `${count} messages`; bar.append(title); svg.append(bar); }); return svg;
}
export class StatsPanel {
  private timer: ReturnType<typeof setInterval>;
  private scope: HTMLSelectElement;
  private channel: HTMLSelectElement;
  private exclusions: HTMLInputElement;
  constructor(private dialog: HTMLDialogElement, private trigger: HTMLButtonElement, private header: HTMLElement, private messages: () => readonly ChatMessage[], private emotes: (channel: string) => Record<string, Emote>, channels: string[],private timeline?:RateSeries) {
    this.scope = dialog.querySelector<HTMLSelectElement>('#stats-scope')!; this.channel = dialog.querySelector<HTMLSelectElement>('#stats-channel')!; this.exclusions = dialog.querySelector<HTMLInputElement>('#stats-exclusions')!;
    for (const channel of channels) { const option = document.createElement('option'); option.value = channel; option.textContent = '#' + channel; this.channel.append(option); }
    try { const saved: unknown = JSON.parse(localStorage.getItem('chatthing:v1:stats') ?? 'null'); if (saved && typeof saved === 'object') { const data = saved as Record<string, unknown>; if (typeof data.excluded === 'string') this.exclusions.value = data.excluded.slice(0, 500); if (typeof data.scope === 'string' && [...this.scope.options].some(o => o.value === data.scope)) this.scope.value = data.scope; } } catch { /* optional storage */ }
    trigger.addEventListener('click', this.open); dialog.querySelector('#stats-close')?.addEventListener('click', this.close); dialog.addEventListener('close', this.closed); dialog.addEventListener('change', this.change);
    this.timer = setInterval(this.paint, 5000); this.paint();
  }
  float():void {this.dialog.removeAttribute('open');this.open();}
  showRail(open:boolean):void {if(open){if(this.dialog.open)this.dialog.close();this.dialog.setAttribute('open','');this.paint();}else this.dialog.removeAttribute('open');}
  private open = (): void => { this.dialog.showModal(); this.paint(); };
  private close = (): void => this.dialog.close();
  private closed = (): void => { this.trigger.focus(); };
  private change = (): void => { try { localStorage.setItem('chatthing:v1:stats', JSON.stringify({ scope: this.scope.value, excluded: this.exclusions.value })); } catch { /* optional storage */ } this.paint(); };
  private paint = (): void => {
    const now = Date.now(); const excluded = new Set(this.exclusions.value.toLowerCase().split(/[\s,]+/).filter(Boolean));
    const stats = summarize(this.messages(), now, 60000, '', excluded, this.emotes);
    if(!this.timeline)this.header.replaceChildren(rateGraph(stats.buckets, `Last minute: ${stats.messages} messages from ${stats.chatters} chatters`)); if(!this.timeline)this.header.title = `${stats.messages}/min · ${stats.chatters} chatters`;
    if (!this.dialog.open) return;
    const windowMs = Number(this.scope.value); const data = summarize(this.messages(), now, windowMs, this.channel.value, excluded, this.emotes);
    const summary = this.dialog.querySelector<HTMLElement>('#stats-summary')!; summary.textContent = `${data.messages.toLocaleString()} messages · ${data.glorps.toLocaleString()} glorp/F · ${data.chatters.toLocaleString()} chatters · ${data.perMinute.toFixed(1)}/min · peak minute ${data.peakPerMinute}`;
    const graph = this.dialog.querySelector<HTMLElement>('#stats-graph')!; graph.replaceChildren(rateGraph(data.buckets, 'Message count over the selected time window'));
    const body = this.dialog.querySelector<HTMLElement>('#stats-lists')!; body.replaceChildren();
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
    for (const [title, rows] of [['Users', data.users], ['Top glorpers',data.glorpers], ['Emotes', data.emotes], ['Badges', data.badges], ['Link domains', data.links], ['Hours', data.hours], ['Days', data.days]] as const) {
      const section = document.createElement('section'); const heading = document.createElement('h3'); heading.textContent = title; section.append(heading); const list = document.createElement('ol');
      for (const row of rows) { const item = document.createElement('li'); item.textContent = `${row.name} · ${row.count.toLocaleString()}`; list.append(item); } section.append(list); body.append(section);
    }
  };
  stop(): void { clearInterval(this.timer); this.trigger.removeEventListener('click', this.open); this.dialog.querySelector('#stats-close')?.removeEventListener('click', this.close); this.dialog.removeEventListener('close', this.closed); this.dialog.removeEventListener('change', this.change); }
}
