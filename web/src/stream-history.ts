import type { ChannelMetadata } from './metadata';
export interface StreamSample { at: number; live: boolean; viewers: number | null; title: string }
type Archive = NonNullable<ChannelMetadata['lastVod']>;
const key = 'chatthing:v1:stream-history', keep = 7 * 86400000;
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function sample(value: unknown): value is StreamSample {
  return object(value) && typeof value.at === 'number' && Number.isSafeInteger(value.at) && value.at >= 0 && value.at <= Date.now() + 60000 && typeof value.live === 'boolean' && (value.viewers === null || typeof value.viewers === 'number' && Number.isSafeInteger(value.viewers) && value.viewers >= 0 && value.viewers <= 1000000000) && typeof value.title === 'string' && value.title.length <= 500;
}
function archive(value: unknown): value is Archive {
  return object(value) && typeof value.start === 'string' && typeof value.end === 'string' && Number.isFinite(Date.parse(value.start)) && Date.parse(value.end) > Date.parse(value.start) && Date.parse(value.end) - Date.parse(value.start) <= keep && typeof value.url === 'string' && /^https:\/\/www\.twitch\.tv\/videos\/[0-9]{1,30}$/.test(value.url) && typeof value.title === 'string' && value.title.length <= 500;
}
export class StreamHistory {
  private rows = new Map<string, StreamSample[]>();
  private vods = new Map<string, Archive[]>();
  storageFailed = false;
  constructor(private channels: readonly string[]) {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (!object(value) || value.version !== 1 || !Array.isArray(value.samples) || !Array.isArray(value.archives) || value.samples.length > 30 || value.archives.length > 30) return;
      const rows = new Map<string, StreamSample[]>(), vods = new Map<string, Archive[]>();
      for (const entry of value.samples) {
        if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || !Array.isArray(entry[1]) || entry[1].length > 10080 || !entry[1].every(sample)) return;
        rows.set(entry[0], entry[1].filter(row => row.at >= Date.now() - keep).sort((a, b) => a.at - b.at));
      }
      for (const entry of value.archives) {
        if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || !Array.isArray(entry[1]) || entry[1].length > 30 || !entry[1].every(archive)) return;
        vods.set(entry[0], entry[1]);
      }
      this.rows = rows; this.vods = vods;
    } catch { /* optional history does not block current metadata */ }
  }
  observe(data: ChannelMetadata, now = Date.now()): void {
    if (!this.channels.includes(data.channel)) return;
    if (data.lastVod && archive(data.lastVod)) {
      const saved = this.vods.get(data.channel) ?? []; const index = saved.findIndex(vod => vod.url === data.lastVod?.url);
      if (index >= 0) saved[index] = data.lastVod; else saved.push(data.lastVod);
      saved.sort((a, b) => Date.parse(b.start) - Date.parse(a.start)); this.vods.set(data.channel, saved.slice(0, 30));
    }
    if (data.errors.includes('stream uptime') || !data.stream.uptime.trim()) return;
    const offline = /offline|not streaming|not live|not online|not found/i.test(data.stream.uptime);
    if (!offline && !/\d+\s*(?:day|hour|minute|second)s?/i.test(data.stream.uptime)) return;
    const number = Number(data.stream.viewers);
    const viewers = !data.errors.includes('stream viewers') && /^\d+$/.test(data.stream.viewers) && Number.isSafeInteger(number) && number <= 1000000000 ? number : null;
    const rows = this.rows.get(data.channel) ?? [], previous = rows.at(-1);
    const next = { at: now, live: !offline, viewers, title: data.errors.includes('stream title')?'':data.stream.title.slice(0, 500) };
    if (previous?.at === now) rows[rows.length - 1] = next; else rows.push(next);
    this.rows.set(data.channel, rows.filter(row => row.at >= now - keep).slice(-10080));
    while (this.rows.size > 30) { const oldest = this.rows.keys().next().value; if (oldest === undefined) break; this.rows.delete(oldest); this.vods.delete(oldest); }
    this.save();
  }
  samples(channel: string, from: number): StreamSample[] { return (this.rows.get(channel) ?? []).filter(row => row.at >= from); }
  archives(channel: string): Archive[] { return [...(this.vods.get(channel) ?? [])]; }
  peak(channel: string, from: number): { viewers: number; at: number } | undefined {
    let peak: { viewers: number; at: number } | undefined;
    for (const row of this.samples(channel, from)) if (row.live && row.viewers !== null && (!peak || row.viewers > peak.viewers)) peak = { viewers: row.viewers, at: row.at };
    return peak;
  }
  save(): void { try { localStorage.setItem(key, JSON.stringify({ version: 1, samples: [...this.rows], archives: [...this.vods] })); this.storageFailed = false; } catch { this.storageFailed = true; } }
}
