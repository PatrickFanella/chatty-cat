import type { ChatMessage } from './protocol';
export type InboxKind = 'mentions' | 'replies' | 'whispers';
export interface InboxItem {
  key: string;
  kind: InboxKind;
  message: ChatMessage;
  read: boolean;
  outgoing: boolean;
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
interface ReadState {
  keys: string[];
  cursors: Record<string, number>;
}
export class ConversationInbox {
  private account = '';
  private login = '';
  private entries: InboxItem[] = [];
  private seen = new Set<string>();
  private threads = new Set<string>();
  private own = new Set<string>();
  private read: ReadState = { keys: [], cursors: {} };
  error = '';
  setAccount(id: string, login: string): boolean {
    if (id === this.account && login === this.login) return false;
    this.account = /^[a-zA-Z0-9_-]{1,80}$/.test(id) ? id : '';
    this.login = login.toLowerCase();
    this.entries = [];
    this.seen.clear();
    this.threads.clear();
    this.own.clear();
    this.read = { keys: [], cursors: {} };
    this.error = '';
    if (this.account)
      try {
        this.read = this.readStored();
      } catch {
        this.error = 'Public inbox read state could not be restored';
      }
    return true;
  }
  private readStored(): ReadState {
    const read: ReadState = { keys: [], cursors: {} };
    const raw = localStorage.getItem('chatthing:v1:inbox-read:' + this.account);
    if (!raw) return read;
    if (raw.length > 65536) throw new Error('Invalid read state');
    const value: unknown = JSON.parse(raw);
    if (!record(value)) throw new Error('Invalid read state');
    const data: Record<string, unknown> = value;
    if (data.version !== 1) throw new Error('Invalid read state');
    if (Array.isArray(data.keys))
      read.keys = data.keys
        .filter(
          (v): v is string =>
            typeof v === 'string' && v.length <= 250 && /^(mentions|replies):[a-z0-9_]{1,25}:/.test(v),
        )
        .slice(-500);
    if (data.cursors && typeof data.cursors === 'object')
      for (const [key, v] of Object.entries(data.cursors).slice(-100))
        if (
          /^(mentions|replies):[a-z0-9_]{1,25}$/.test(key) &&
          typeof v === 'number' &&
          Number.isSafeInteger(v) &&
          v >= 0 &&
          v <= Date.now()
        )
          read.cursors[key] = v;
    return read;
  }
  refreshReads(): void {
    if (!this.account) return;
    this.read = this.readStored();
    for (const item of this.entries)
      if (
        item.kind !== 'whispers' &&
        (this.read.keys.includes(item.key) ||
          item.message.timestamp <= (this.read.cursors[item.kind + ':' + item.message.channel] ?? -1))
      )
        item.read = true;
  }
  get authenticated(): boolean {
    return !!this.account;
  }
  private bound(set: Set<string>, cap: number): void {
    while (set.size > cap) {
      const first = set.values().next().value;
      if (first !== undefined) set.delete(first);
    }
  }
  observe(message: ChatMessage, forceMention = false): boolean {
    if (!this.account || !message.id || message.id.length > 200 || message.command !== 'PRIVMSG') return false;
    const thread = message.tags['reply-thread-parent-msg-id'] || message.tags['reply-parent-msg-id'];
    if (message.login.toLowerCase() === this.login) {
      this.own.add(message.channel + ':' + message.id);
      this.bound(this.own, 1000);
      if (thread) {
        this.threads.add(message.channel + ':' + thread);
        this.bound(this.threads, 500);
      }
      return false;
    }
    let changed = false;
    if (
      (message.tags['reply-parent-user-login'] ?? '').toLowerCase() === this.login ||
      message.tags['reply-parent-user-id'] === this.account ||
      this.own.has(message.channel + ':' + (message.tags['reply-parent-msg-id'] ?? '')) ||
      (!!thread && this.threads.has(message.channel + ':' + thread))
    )
      changed = this.add('replies', message, false) || changed;
    const words = message.text.toLowerCase().split(/[^a-z0-9_]+/);
    if (forceMention || (this.login && words.includes(this.login)))
      changed = this.add('mentions', message, false) || changed;
    return changed;
  }
  whisper(message: ChatMessage, outgoing: boolean): void {
    if (this.account && message.id && message.command === 'WHISPER') this.add('whispers', message, outgoing);
  }
  private add(kind: InboxKind, message: ChatMessage, outgoing: boolean): boolean {
    const key = kind + ':' + message.channel + ':' + (outgoing ? 'out:' : '') + message.id;
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    this.bound(this.seen, 2500);
    const read =
      outgoing ||
      (kind !== 'whispers' &&
        (this.read.keys.includes(key) || message.timestamp <= (this.read.cursors[kind + ':' + message.channel] ?? -1)));
    const compact = {
      ...message,
      text: message.text.slice(0, 500),
      tags: { 'display-name': (message.tags['display-name'] ?? message.login).slice(0, 100) },
    };
    this.entries.push({ key, kind, message: compact, read, outgoing });
    const cap = kind === 'whispers' ? 200 : 500;
    while (this.entries.filter((item) => item.kind === kind).length > cap) {
      const index = this.entries.findIndex((item) => item.kind === kind);
      this.entries.splice(index, 1);
    }
    return true;
  }
  items(kind: InboxKind, channel = ''): InboxItem[] {
    return this.entries
      .filter((item) => item.kind === kind && (!channel || item.message.channel === channel))
      .slice()
      .reverse()
      .map((item) => ({ ...item, message: { ...item.message, tags: { ...item.message.tags } } }));
  }
  unread(kind: InboxKind, channel = ''): number {
    return this.entries.filter(
      (item) => item.kind === kind && !item.read && (!channel || item.message.channel === channel),
    ).length;
  }
  private save(next: ReadState): void {
    const stored = this.readStored();
    const combined = { ...stored.cursors };
    for (const [key, value] of Object.entries(next.cursors)) combined[key] = Math.max(combined[key] ?? 0, value);
    const cursors = Object.fromEntries(Object.entries(combined).slice(-100));
    const keys = [...new Set([...stored.keys, ...next.keys])].slice(-500);
    const raw = JSON.stringify({ version: 1, keys, cursors });
    if (raw.length > 65536) throw new Error('Public inbox read-state limit reached');
    try {
      localStorage.setItem('chatthing:v1:inbox-read:' + this.account, raw);
    } catch {
      throw new Error('Public read state could not be saved; unread items were retained');
    }
    this.read = { keys, cursors };
  }
  markRead(key: string): void {
    const entry = this.entries.find((item) => item.key === key);
    if (!entry) return;
    if (entry.kind !== 'whispers') this.save({ keys: [...this.read.keys, key], cursors: { ...this.read.cursors } });
    entry.read = true;
  }
  markAll(kind: InboxKind, channel = ''): void {
    if (!this.account) return;
    const entries = this.entries.filter((item) => item.kind === kind && (!channel || item.message.channel === channel));
    if (kind !== 'whispers') {
      const cursors = { ...this.read.cursors };
      for (const item of entries) cursors[kind + ':' + item.message.channel] = Date.now();
      this.save({ keys: [...this.read.keys, ...entries.map((item) => item.key)], cursors });
    }
    for (const item of entries) item.read = true;
  }
  clear(): void {
    this.setAccount('', '');
  }
}
