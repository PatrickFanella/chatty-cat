import type { ChatMessage } from './protocol';
import { gapBuckets } from './chat-gaps';

export function headerRate(
  messages: readonly ChatMessage[],
  now: number,
  excluded: ReadonlySet<string>,
): { rates: number[]; gaps: boolean[]; pageGaps: boolean[]; perSecond: number; chatters: number; end: number } {
  const end = Math.floor(now / 1000) * 1000,
    from = end - 240000;
  const seconds = new Map<number, number>(),
    seen = new Set<string>(),
    chatters = new Set<string>();
  let latest = 0;
  for (const message of messages) {
    if (
      message.command !== 'PRIVMSG' ||
      message.timestamp > now ||
      message.timestamp < now - 3600000 ||
      excluded.has(message.login.toLowerCase())
    )
      continue;
    const key = message.channel + ':' + message.id;
    if (message.id && seen.has(key)) continue;
    if (message.id) seen.add(key);
    chatters.add(message.login);
    if (message.timestamp > now - 5000) latest++;
    if (message.timestamp < from - 4000 || message.timestamp >= end) continue;
    const second = Math.floor(message.timestamp / 1000);
    seconds.set(second, (seconds.get(second) ?? 0) + 1);
  }
  const rates = Array.from({ length: 240 }, (_, i) => {
    const second = from / 1000 + i;
    let count = 0;
    for (let offset = 0; offset < 5; offset++) count += seconds.get(second - offset) ?? 0;
    return count / 5;
  });
  return {
    rates,
    gaps: gapBuckets(messages, end, 240000, 240),
    pageGaps: gapBuckets(messages, end, 240000, 240, 'page'),
    perSecond: latest / 5,
    chatters: chatters.size,
    end,
  };
}
