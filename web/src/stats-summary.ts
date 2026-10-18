import type { ChatMessage } from './protocol';
import { findLinks } from './links';
import { tokenize, type Emote } from './tokens';
import { isGlorp } from './glorp';
import { gapBuckets } from './chat-gaps';
import { loudestBursts, type Burst } from './bursts';
export interface Rank {
  name: string;
  count: number;
}
export interface Stats {
  messages: number;
  glorps: number;
  glorpers: Rank[];
  chatters: number;
  perMinute: number;
  peakPerMinute: number;
  buckets: number[];
  gaps: boolean[];
  pageGaps: boolean[];
  bursts: Burst[];
  users: Rank[];
  emotes: Rank[];
  badges: Rank[];
  links: Rank[];
  hours: Rank[];
  days: Rank[];
}
export function summarize(
  messages: readonly ChatMessage[],
  now: number,
  windowMs: number,
  channel: string,
  excluded: ReadonlySet<string>,
  emotes: (channel: string) => Record<string, Emote>,
): Stats {
  const maps = {
    users: new Map<string, number>(),
    glorpers: new Map<string, number>(),
    emotes: new Map<string, number>(),
    badges: new Map<string, number>(),
    links: new Map<string, number>(),
    hours: new Map<string, number>(),
    days: new Map<string, number>(),
  };
  const buckets = Array<number>(60).fill(0);
  const minute = new Map<number, number>();
  const seen = new Set<string>();
  let count = 0;
  let glorps = 0;
  const increment = <K>(map: Map<K, number>, key: K): void => {
    map.set(key, (map.get(key) ?? 0) + 1);
  };
  const from = now - windowMs;
  const included: ChatMessage[] = [];
  for (const message of messages) {
    if (
      message.command !== 'PRIVMSG' ||
      message.timestamp < from ||
      message.timestamp > now ||
      (channel && message.channel !== channel) ||
      excluded.has(message.login.toLowerCase())
    )
      continue;
    const key = message.channel + ':' + message.id;
    if (message.id && seen.has(key)) continue;
    if (message.id) seen.add(key);
    included.push(message);
    count++;
    if (isGlorp(message)) {
      glorps++;
      increment(maps.glorpers, message.login);
    }
    increment(maps.users, message.login);
    increment(minute, Math.floor(message.timestamp / 60000));
    const bin = Math.min(59, Math.floor(((message.timestamp - from) / windowMs) * 60));
    buckets[bin] = (buckets[bin] ?? 0) + 1;
    for (const token of tokenize(
      message.text,
      message.tags.emotes ?? '',
      emotes(message.channel),
      false,
      /^[1-9][0-9]*$/.test(message.tags.bits ?? ''),
    ))
      if (token.type === 'emote') increment(maps.emotes, token.emote.code);
    for (const badge of (message.tags.badges ?? '').split(',')) {
      const name = badge.split('/')[0];
      if (name) increment(maps.badges, name);
    }
    for (const link of findLinks(message.text)) increment(maps.links, new URL(link.href).hostname);
    const date = new Date(message.timestamp);
    increment(maps.hours, String(date.getHours()).padStart(2, '0') + ':00');
    increment(maps.days, date.toLocaleDateString());
  }
  const ranks = (map: Map<string, number>): Rank[] =>
    [...map]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 50);
  return {
    messages: count,
    glorps,
    glorpers: ranks(maps.glorpers),
    chatters: maps.users.size,
    perMinute: count / (windowMs / 60000),
    peakPerMinute: Math.max(0, ...minute.values()),
    buckets,
    gaps: gapBuckets(messages, now, windowMs),
    pageGaps: gapBuckets(messages, now, windowMs, 60, 'page'),
    bursts: loudestBursts(included, messages, now),
    users: ranks(maps.users),
    emotes: ranks(maps.emotes),
    badges: ranks(maps.badges),
    links: ranks(maps.links),
    hours: ranks(maps.hours),
    days: ranks(maps.days),
  };
}

// A report contains one retained-row snapshot, shared by the optional header and panel.
export interface StatisticsSummaryRequest {
  messages: readonly ChatMessage[];
  catalogs: Record<string, Record<string, Emote>>;
  now: number;
  windowMs: number;
  channel: string;
  excluded: string[];
  header: boolean;
  panel: boolean;
}
export interface StatisticsSummaryReport {
  header: Stats | undefined;
  panel: Stats | undefined;
}
export function statisticsSummary(request: StatisticsSummaryRequest): StatisticsSummaryReport {
  if (
    !Array.isArray(request.messages) ||
    request.messages.length > 100000 ||
    !Number.isSafeInteger(request.now) ||
    request.now < 0 ||
    !Number.isFinite(request.windowMs) ||
    request.windowMs <= 0 ||
    typeof request.channel !== 'string' ||
    !Array.isArray(request.excluded) ||
    request.excluded.length > 500 ||
    !request.excluded.every((name) => typeof name === 'string') ||
    !request.catalogs ||
    typeof request.catalogs !== 'object' ||
    Object.keys(request.catalogs).length > 24 ||
    typeof request.header !== 'boolean' ||
    typeof request.panel !== 'boolean'
  )
    throw new Error('Invalid retained statistics request');
  const excluded = new Set(request.excluded);
  const emotes = (channel: string) => (Object.hasOwn(request.catalogs, channel) ? request.catalogs[channel]! : {});
  return {
    header: request.header ? summarize(request.messages, request.now, 60000, '', excluded, emotes) : undefined,
    panel: request.panel
      ? summarize(request.messages, request.now, request.windowMs, request.channel, excluded, emotes)
      : undefined,
  };
}
