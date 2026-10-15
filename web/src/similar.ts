import type { ChatMessage } from './protocol';
export interface SimilarityOptions {
  enabled: boolean;
  threshold: number;
  windowSeconds: number;
  maxComparisons: number;
  sameAuthorExempt: boolean;
  selfExempt: boolean;
  behavior: 'hide' | 'dim';
  highlightSimilar: boolean;
}
export function parseSimilarity(value: unknown): SimilarityOptions {
  const v = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const num = (key: string, fallback: number, min: number, max: number): number =>
    typeof v[key] === 'number' && Number.isFinite(v[key]) ? Math.max(min, Math.min(max, v[key])) : fallback;
  return {
    enabled: v.enabled === true,
    threshold: num('threshold', 0.85, 0.5, 1),
    windowSeconds: num('windowSeconds', 30, 1, 120),
    maxComparisons: Math.floor(num('maxComparisons', 20, 1, 50)),
    sameAuthorExempt: v.sameAuthorExempt !== false,
    selfExempt: v.selfExempt !== false,
    behavior: v.behavior === 'hide' ? 'hide' : 'dim',
    highlightSimilar: v.highlightSimilar === true,
  };
}
function tokens(text: string): Set<string> {
  const value = text.slice(0, 500).toLowerCase().replace(/\s+/g, ' ').trim();
  const set = new Set<string>();
  if (value.length < 3) set.add(value);
  else for (let i = 0; i < value.length - 2; i++) set.add(value.slice(i, i + 3));
  return set;
}
export class SimilarMessages {
  private recent: { message: ChatMessage; tokens: Set<string> }[] = [];
  private decisions = new WeakMap<ChatMessage, boolean>();
  private seen = new Map<string, boolean>();
  private watermark = 0;
  constructor(readonly options: SimilarityOptions) {}
  classify(message: ChatMessage, self = ''): boolean {
    if (!this.options.enabled || message.command !== 'PRIVMSG') return false;
    const cached = this.decisions.get(message);
    if (cached !== undefined) return cached;
    const key = message.channel + ':' + message.id,
      seen = this.seen.get(key);
    if (seen !== undefined) {
      this.decisions.set(message, seen);
      return seen;
    }
    this.watermark = Math.max(this.watermark, message.timestamp);
    const cutoff = this.watermark - this.options.windowSeconds * 1000;
    this.recent = this.recent.filter((p) => p.message.timestamp >= cutoff);
    const own = this.options.selfExempt && message.login.toLowerCase() === self.toLowerCase();
    const current = tokens(message.text);
    let similar = false,
      comparisons = 0;
    if (!own && message.timestamp >= cutoff)
      for (let i = this.recent.length - 1; i >= 0; i--) {
        const p = this.recent[i]!;
        if (
          p.message.channel !== message.channel ||
          (this.options.sameAuthorExempt && p.message.login === message.login)
        )
          continue;
        if (++comparisons > this.options.maxComparisons) break;
        let intersection = 0;
        for (const t of current) if (p.tokens.has(t)) intersection++;
        if (intersection / (current.size + p.tokens.size - intersection || 1) >= this.options.threshold) {
          similar = true;
          break;
        }
      }
    if (!own && message.timestamp >= cutoff) this.recent.push({ message, tokens: current });
    while (this.recent.length > 100) this.recent.shift();
    this.decisions.set(message, similar);
    this.seen.set(key, similar);
    while (this.seen.size > 5000) this.seen.delete(this.seen.keys().next().value!);
    return similar;
  }
}
