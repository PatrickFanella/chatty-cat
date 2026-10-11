import type { ChatMessage } from './protocol';
export class RoomStates {
  private rooms = new Map<string, Record<string, string>>();
  observe(message: ChatMessage): boolean {
    if (message.command !== 'ROOMSTATE') return false;
    const old = this.rooms.get(message.channel) ?? {}; const next = { ...old };
    for (const key of ['slow', 'followers-only', 'subs-only', 'emote-only', 'r9k']) if (message.tags[key] !== undefined) next[key] = message.tags[key];
    this.rooms.set(message.channel, next); return true;
  }
  slow(channel: string): number { const value = Number(this.rooms.get(channel)?.slow); return Number.isSafeInteger(value) && value > 0 && value <= 120 ? value : 0; }
  labels(channel: string): string[] {
    const tags = this.rooms.get(channel); if (!tags) return [];
    const chips: string[] = [];
    const slow = Number(tags.slow); if (Number.isFinite(slow) && slow > 0) chips.push(`Slow ${slow}s`);
    const followers = Number(tags['followers-only']);
    if (tags['followers-only'] !== undefined && Number.isFinite(followers) && followers >= 0) chips.push(followers ? `Followers ${followers}m` : 'Followers only');
    if (tags['subs-only'] === '1') chips.push('Subscribers only');
    if (tags['emote-only'] === '1') chips.push('Emotes only');
    if (tags.r9k === '1') chips.push('Unique chat');
    return chips;
  }
}
