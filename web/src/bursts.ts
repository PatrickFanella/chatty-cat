import type { ChatMessage } from './protocol';
import { readChatGaps } from './chat-gaps';

export interface Burst { perSecond: number; timestamp: number }

// Rank five-second rolling windows, matching the original's 4 msgs/s floor.
// Callers supply their already filtered, deduplicated chat messages.
export function loudestBursts(messages: readonly ChatMessage[], evidence: readonly ChatMessage[], now: number): Burst[] {
  const counts = new Map<number, number>();
  for (const message of messages) {
    const second = Math.floor(message.timestamp / 1000);
    counts.set(second, (counts.get(second) ?? 0) + 1);
  }
  const candidates = new Set<number>();
  for (const second of counts.keys()) for (let offset = 0; offset < 5; offset++) candidates.add(second + offset);
  const gaps = readChatGaps(evidence, now);
  const samples: Burst[] = [];
  for (const second of candidates) {
    const timestamp = (second + 1) * 1000;
    if (timestamp > now || gaps.some(gap => gap.start < timestamp && (gap.end ?? now) > timestamp - 5000)) continue;
    let count = 0;
    for (let offset = 0; offset < 5; offset++) count += counts.get(second - offset) ?? 0;
    if (count >= 20) samples.push({ perSecond: count / 5, timestamp });
  }
  samples.sort((a, b) => b.perSecond - a.perSecond || a.timestamp - b.timestamp);
  const picks: Burst[] = [];
  for (const sample of samples) {
    if (picks.every(pick => {
      const distance = Math.abs(pick.timestamp - sample.timestamp);
      return distance > 10000 && !(distance <= 30000 && sample.perSecond >= pick.perSecond - .05);
    })) picks.push(sample);
    if (picks.length === 3) break;
  }
  return picks.map(pick => ({ perSecond: pick.perSecond, timestamp: samples.reduce((earliest, sample) =>
    Math.abs(sample.timestamp - pick.timestamp) <= 30000 && sample.perSecond >= pick.perSecond - .05
      ? Math.min(earliest, sample.timestamp) : earliest, pick.timestamp) }));
}
