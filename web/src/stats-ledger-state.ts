import type { ChatMessage } from './protocol';
export type StatKind = 'users' | 'emotes' | 'badges' | 'links';
export interface Counter {
  total: number;
  hours: Map<number, number>;
  days: Map<number, number>;
}
export interface PendingClassification {
  message: ChatMessage | undefined;
  at: number;
  counted: string[];
}
export interface LedgerState {
  data: Map<string, Counter>;
  seen: Set<string>;
  pending: Map<string, PendingClassification>;
  bucketCount: number;
  since: number;
  limited: boolean;
}
export const MAX_LEDGER_KEYS = 20000,
  MAX_LEDGER_BUCKETS = 200000;
const KINDS: StatKind[] = ['users', 'emotes', 'badges', 'links'];
export function restoreLedgerState(value: unknown, channels: readonly string[], now: number): LedgerState | undefined {
  if (!value || typeof value !== 'object') return;
  const data = value as Record<string, unknown>;
  if (
    data.version !== 1 ||
    !Array.isArray(data.rows) ||
    data.rows.length > MAX_LEDGER_KEYS ||
    typeof data.since !== 'number' ||
    !Number.isSafeInteger(data.since) ||
    data.since < 0 ||
    data.since > now
  )
    return;
  if (
    data.seen !== undefined &&
    (!Array.isArray(data.seen) ||
      data.seen.length > 100000 ||
      !data.seen.every(
        (key: unknown) =>
          typeof key === 'string' && key.length <= 256 && channels.some((channel) => key.startsWith(channel + ':')),
      ))
  )
    return;
  const restored = new Map<string, Counter>();
  let buckets = 0;
  for (const raw of data.rows) {
    if (
      !Array.isArray(raw) ||
      raw.length !== 4 ||
      !Array.isArray(raw[0]) ||
      raw[0].length !== 3 ||
      !raw[0].every((v: unknown) => typeof v === 'string') ||
      !channels.includes(raw[0][0]!) ||
      !KINDS.some((kind) => kind === raw[0][1]) ||
      !raw[0][2] ||
      raw[0][2].length > 2048 ||
      !Number.isSafeInteger(raw[1]) ||
      raw[1] < 0 ||
      !Array.isArray(raw[2]) ||
      raw[2].length > 170 ||
      !Array.isArray(raw[3]) ||
      raw[3].length > 33
    )
      return;
    if (raw[0][1] === 'links') {
      try {
        const url = new URL(raw[0][2]);
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return;
      } catch {
        return;
      }
    }
    const maps: Map<number, number>[] = [];
    for (const rows of [raw[2], raw[3]]) {
      const map = new Map<number, number>();
      for (const entry of rows) {
        if (
          !Array.isArray(entry) ||
          entry.length !== 2 ||
          !entry.every(Number.isSafeInteger) ||
          entry[0] < 0 ||
          entry[1] < 0 ||
          entry[1] > raw[1]
        )
          return;
        if (map.has(entry[0])) return;
        map.set(entry[0], entry[1]);
      }
      buckets += map.size;
      maps.push(map);
    }
    if (buckets > MAX_LEDGER_BUCKETS) return;
    if (restored.has(JSON.stringify(raw[0]))) return;
    restored.set(JSON.stringify(raw[0]), { total: raw[1], hours: maps[0]!, days: maps[1]! });
  }
  const pending = new Map<string, { message: ChatMessage | undefined; at: number; counted: string[] }>();
  if (data.pending !== undefined) {
    if (!Array.isArray(data.pending) || data.pending.length > 100000) return;
    for (const raw of data.pending) {
      if (
        !Array.isArray(raw) ||
        raw.length !== 3 ||
        typeof raw[0] !== 'string' ||
        raw[0].length > 300 ||
        !channels.some((channel) => raw[0].startsWith(channel + ':')) ||
        !Number.isSafeInteger(raw[1]) ||
        raw[1] < 0 ||
        raw[1] > now + 5000 ||
        !Array.isArray(raw[2]) ||
        raw[2].length > 500 ||
        !raw[2].every((code: unknown) => typeof code === 'string' && code.length <= 100)
      )
        return;
      pending.set(raw[0], { message: undefined, at: raw[1], counted: raw[2] });
    }
  }
  const state: LedgerState = {
    pending,
    data: restored,
    seen: new Set(Array.isArray(data.seen) ? data.seen : []),
    bucketCount: buckets,
    since: data.since,
    limited: data.limited === true,
  };
  const hour = Math.floor(now / 3600000) - 168,
    day = Math.floor(now / 86400000) - 31;
  for (const value of state.data.values())
    for (const [map, from] of [
      [value.hours, hour],
      [value.days, day],
    ] as const)
      for (const index of map.keys())
        if (index < from) {
          map.delete(index);
          state.bucketCount--;
        }
  return state;
}
