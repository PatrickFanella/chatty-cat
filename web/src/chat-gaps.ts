import type { ChatMessage } from './protocol';

export interface ChatGap {
  channel: string;
  start: number;
  end: number | null;
  kind: 'connection' | 'page';
}
export function readChatGaps(messages: readonly ChatMessage[], now: number): ChatGap[] {
  const gaps = new Map<string, ChatGap>();
  for (const message of messages) {
    const phase = message.tags['gap-state'];
    if (
      message.command !== 'NOTICE' ||
      message.login ||
      !message.id.startsWith('gap-') ||
      message.tags['client-notice'] !== '1' ||
      (phase !== 'start' && phase !== 'end')
    )
      continue;
    const raw = message.tags['gap-start'] ?? '',
      start = Number(raw);
    if (
      !/^\d+$/.test(raw) ||
      !Number.isSafeInteger(start) ||
      start < 0 ||
      start > message.timestamp ||
      message.timestamp > now
    )
      continue;
    const kind = message.tags['gap-kind'] === 'page' ? 'page' : 'connection';
    const key = message.channel + ':' + kind + ':' + start,
      old = gaps.get(key);
    if (phase === 'end')
      gaps.set(key, { channel: message.channel, start, end: Math.max(old?.end ?? 0, message.timestamp), kind });
    else if (!old) gaps.set(key, { channel: message.channel, start, end: null, kind });
  }
  return [...gaps.values()];
}

// The browser's shared connection covers all its joined channels. Gaps apply
// regardless of the selected ranking channel or excluded chatter names.
export function gapBuckets(
  messages: readonly ChatMessage[],
  now: number,
  windowMs: number,
  binCount = 60,
  kind?: ChatGap['kind'],
): boolean[] {
  const bins = Array<boolean>(binCount).fill(false),
    from = now - windowMs;
  for (const gap of readChatGaps(messages, now)) {
    if (kind && gap.kind !== kind) continue;
    const end = gap.end ?? now;
    if (end <= gap.start) continue;
    for (let i = 0; i < bins.length; i++) {
      const left = from + (i * windowMs) / bins.length,
        right = from + ((i + 1) * windowMs) / bins.length;
      if (gap.start < right && end > left) bins[i] = true;
    }
  }
  return bins;
}
