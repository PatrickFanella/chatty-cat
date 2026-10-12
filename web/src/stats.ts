import type { ChatMessage } from './protocol';
import { cleanURL } from './links';
import { tokenize, type Emote } from './tokens';
import { gapBuckets } from './chat-gaps';
import { loudestBursts, type Burst } from './bursts';
import { headerRate } from './header-rate';
export interface Rank { name: string; count: number }
export interface Stats { messages: number; chatters: number; perMinute: number; peakPerMinute: number; buckets: number[]; gaps: boolean[]; pageGaps: boolean[]; bursts: Burst[]; users: Rank[]; emotes: Rank[]; badges: Rank[]; links: Rank[]; hours: Rank[]; days: Rank[] }
export function summarize(messages: readonly ChatMessage[], now: number, windowMs: number, channel: string, excluded: ReadonlySet<string>, emotes: (channel: string) => Record<string, Emote>): Stats {
  const maps = { users: new Map<string, number>(), emotes: new Map<string, number>(), badges: new Map<string, number>(), links: new Map<string, number>(), hours: new Map<string, number>(), days: new Map<string, number>() };
  const buckets = Array<number>(60).fill(0); const minute = new Map<number, number>(); const seen = new Set<string>(); let count = 0;
  const increment = <K>(map: Map<K, number>, key: K): void => { map.set(key, (map.get(key) ?? 0) + 1); };
  const from = now - windowMs;
  const included: ChatMessage[] = [];
  for (const message of messages) {
    if (message.command !== 'PRIVMSG' || message.timestamp < from || message.timestamp > now || (channel && message.channel !== channel) || excluded.has(message.login.toLowerCase())) continue;
    const key = message.channel + ':' + message.id; if (message.id && seen.has(key)) continue; if (message.id) seen.add(key);
    included.push(message);
    count++; increment(maps.users, message.login); increment(minute, Math.floor(message.timestamp / 60000));
    const bin = Math.min(59, Math.floor((message.timestamp - from) / windowMs * 60)); buckets[bin] = (buckets[bin] ?? 0) + 1;
    for (const token of tokenize(message.text, message.tags.emotes ?? '', emotes(message.channel),false,/^[1-9][0-9]*$/.test(message.tags.bits??''))) if (token.type === 'emote') increment(maps.emotes, token.emote.code);
    for (const badge of (message.tags.badges ?? '').split(',')) { const name = badge.split('/')[0]; if (name) increment(maps.badges, name); }
    for (const match of message.text.matchAll(/https?:\/\/[^\s<>]+/gi)) { const url = cleanURL(match[0].replace(/[.,!?;]+$/, '')); if (url) increment(maps.links, new URL(url).hostname); }
    const date = new Date(message.timestamp); increment(maps.hours, String(date.getHours()).padStart(2, '0') + ':00'); increment(maps.days, date.toLocaleDateString());
  }
  const ranks = (map: Map<string, number>): Rank[] => [...map].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 50);
  return { messages: count, chatters: maps.users.size, perMinute: count / (windowMs / 60000), peakPerMinute: Math.max(0, ...minute.values()), buckets, gaps: gapBuckets(messages, now, windowMs), pageGaps: gapBuckets(messages, now, windowMs, 60, 'page'), bursts: loudestBursts(included, messages, now),
    users: ranks(maps.users), emotes: ranks(maps.emotes), badges: ranks(maps.badges), links: ranks(maps.links), hours: ranks(maps.hours), days: ranks(maps.days) };
}
export function rateGraph(buckets: readonly number[], label: string, gaps: readonly boolean[] = [], unit = 'messages', pageGaps: readonly boolean[] = []): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg'; const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 300 40'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label);
  if (gaps.some(Boolean)) svg.setAttribute('aria-label', label + ' · Observation gaps; counts may be incomplete');
  gaps.slice(0,buckets.length).forEach((gap,i)=>{if(!gap)return;const band=document.createElementNS(ns,'rect');band.classList.add('graph-gap');if(pageGaps[i])band.classList.add('graph-page-gap');band.setAttribute('x',String(i*300/buckets.length));band.setAttribute('y','0');band.setAttribute('width',String(300/buckets.length));band.setAttribute('height','40');band.setAttribute('fill',pageGaps[i]?'#a474df':'#e65b6c');band.setAttribute('opacity','.35');const title=document.createElementNS(ns,'title');title.textContent=pageGaps[i]?'Page closed or inactive; available backfill may be incomplete':'Connection interrupted; available backfill may be incomplete';band.append(title);svg.append(band);});
  const peak = Math.max(1, ...buckets); buckets.forEach((count, i) => { const bar = document.createElementNS(ns, 'rect'); const height = count / peak * 36; bar.setAttribute('x', String(i * 300 / buckets.length)); bar.setAttribute('y', String(40 - height)); bar.setAttribute('width', String(Math.max(1, 300 / buckets.length - 1))); bar.setAttribute('height', String(height)); bar.setAttribute('fill', 'currentColor'); const title = document.createElementNS(ns, 'title'); title.textContent = `${count} ${unit}`; bar.append(title); svg.append(bar); }); return svg;
}
export class StatsPanel {
  private timer: ReturnType<typeof setInterval>;
  private scope: HTMLSelectElement;
  private channel: HTMLSelectElement;
  private exclusions: HTMLInputElement;
  constructor(private dialog: HTMLDialogElement, private trigger: HTMLButtonElement, private header: HTMLElement, private messages: () => readonly ChatMessage[], private emotes: (channel: string) => Record<string, Emote>, channels: string[]) {
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
    const stats = headerRate(this.messages(), now, excluded);
    const headerGraph = rateGraph(stats.rates, `Last 4 minutes · ${stats.perSecond.toFixed(1)} messages/s now · ${stats.chatters} chatters in the last hour`, stats.gaps, 'messages/s', stats.pageGaps);
    for (let tick = Math.ceil((stats.end - 240000) / 10000) * 10000; tick < stats.end; tick += 10000) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line'), x = (tick - stats.end + 240000) / 240000 * 300;
      line.classList.add('graph-tick'); line.setAttribute('x1', String(x)); line.setAttribute('x2', String(x)); line.setAttribute('y1', tick % 60000 === 0 ? '30' : '35'); line.setAttribute('y2', '40'); line.setAttribute('stroke', 'currentColor'); line.setAttribute('opacity', '.4');
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title'); title.textContent = new Date(tick).toLocaleTimeString(); line.append(title); headerGraph.append(line);
    }
    this.header.replaceChildren(headerGraph); this.header.title = `${stats.perSecond.toFixed(1)} messages/s · ${stats.chatters} chatters/h`;
    if (!this.dialog.open) return;
    const windowMs = Number(this.scope.value); const data = summarize(this.messages(), now, windowMs, this.channel.value, excluded, this.emotes);
    const summary = this.dialog.querySelector<HTMLElement>('#stats-summary')!; summary.textContent = `${data.messages.toLocaleString()} messages · ${data.chatters.toLocaleString()} chatters · ${data.perMinute.toFixed(1)}/min · peak minute ${data.peakPerMinute}`;
    const graph = this.dialog.querySelector<HTMLElement>('#stats-graph')!; graph.replaceChildren(rateGraph(data.buckets, 'Message count over the selected time window', data.gaps, 'messages', data.pageGaps));
    const body = this.dialog.querySelector<HTMLElement>('#stats-lists')!; body.replaceChildren();
    const burstSection = document.createElement('section'), burstHeading = document.createElement('h3'), burstList = document.createElement('ol');
    burstHeading.textContent = 'Message bursts'; burstSection.append(burstHeading, burstList);
    for (const burst of data.bursts) {
      const item = document.createElement('li'), time = document.createElement('time');
      time.dateTime = new Date(burst.timestamp).toISOString(); time.textContent = new Date(burst.timestamp).toLocaleTimeString();
      item.append(`${burst.perSecond.toFixed(1)} messages/s at `, time); burstList.append(item);
    }
    if (!data.bursts.length) { const empty = document.createElement('p'); empty.textContent = 'No bursts of 4+ messages/s in this window.'; burstSection.append(empty); }
    body.append(burstSection);
    for (const [title, rows] of [['Users', data.users], ['Emotes', data.emotes], ['Badges', data.badges], ['Link domains', data.links], ['Hours', data.hours], ['Days', data.days]] as const) {
      const section = document.createElement('section'); const heading = document.createElement('h3'); heading.textContent = title; section.append(heading); const list = document.createElement('ol');
      for (const row of rows) { const item = document.createElement('li'); item.textContent = `${row.name} · ${row.count.toLocaleString()}`; list.append(item); } section.append(list); body.append(section);
    }
  };
  stop(): void { clearInterval(this.timer); this.trigger.removeEventListener('click', this.open); this.dialog.querySelector('#stats-close')?.removeEventListener('click', this.close); this.dialog.removeEventListener('close', this.closed); this.dialog.removeEventListener('change', this.change); }
}
