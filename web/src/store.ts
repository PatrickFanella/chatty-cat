import { receivedMessageID, sharedContext } from './message-context';
import { parseEvent, type ChatMessage } from './protocol';

export class MessageStore {
  readonly messages: ChatMessage[] = [];
  private readonly ids = new Map<string, ChatMessage>();
  private readonly key: string;

  constructor(
    channels: string[],
    private cap = 5000,
    hydrate = true,
  ) {
    this.key = 'chatthing:v1:history:' + channels.join(',');
    if (!hydrate) return;
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(this.key) ?? '[]');
      if (Array.isArray(saved))
        for (const value of saved.slice(-1000)) {
          const event = parseEvent(JSON.stringify({ type: 'message', message: value, replay: true }));
          if (event?.type === 'message') this.add(event.message);
        }
    } catch {
      /* Storage denial or invalid old data leaves a clean session. */
    }
  }

  private identity(message: ChatMessage): string {
    return (
      message.channel +
      ':' +
      (receivedMessageID(message) ||
        [message.command, message.timestamp, message.login, message.text, message.tags['system-msg'] ?? ''].join(':'))
    );
  }
  private removeKeys(message: ChatMessage): void {
    for (const key of [this.identity(message), message.channel + ':' + message.id])
      if (this.ids.get(key) === message) this.ids.delete(key);
  }
  add(message: ChatMessage): boolean {
    const key = this.identity(message);
    const previous = this.ids.get(key) ?? this.ids.get(message.channel + ':' + message.id);
    if (previous) {
      const richer = !sharedContext(previous) && !!sharedContext(message);
      if (!richer && (previous.tags['local-echo'] !== '1' || message.tags['local-echo'] === '1')) return false;
      const index = this.messages.indexOf(previous);
      if (index >= 0) this.messages.splice(index, 1);
    }
    if (previous) this.removeKeys(previous);
    this.ids.set(key, message);
    if (message.id) this.ids.set(message.channel + ':' + message.id, message);
    // Live messages append cheaply; late backfill uses a stable binary insertion.
    let low = 0;
    let high = this.messages.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if ((this.messages[middle]?.timestamp ?? 0) <= message.timestamp) low = middle + 1;
      else high = middle;
    }
    this.messages.splice(low, 0, message);
    while (this.messages.length > this.cap) {
      const removed = this.messages.shift();
      if (removed) this.removeKeys(removed);
    }
    return true;
  }

  // Context may update tags on retained public rows, never insert a row or alter its body.
  enrichPublic(update: (message: ChatMessage) => ChatMessage): ChatMessage[] {
    const changed: ChatMessage[] = [];
    const next = this.messages.map((previous) => {
      if (previous.command !== 'PRIVMSG' && previous.command !== 'USERNOTICE') return previous;
      const value = update(previous);
      if (value === previous) return previous;
      if (
        value.id !== previous.id ||
        value.channel !== previous.channel ||
        value.command !== previous.command ||
        value.login !== previous.login ||
        value.text !== previous.text ||
        value.timestamp !== previous.timestamp
      )
        throw new Error('Context enrichment may only update public tags');
      changed.push(value);
      return value;
    });
    if (changed.length) {
      this.messages.length = 0;
      this.ids.clear();
      for (const message of next) this.add(message);
    }
    return changed;
  }

  restore(messages: readonly ChatMessage[]): void {
    const merged = new Map<string, ChatMessage>();
    for (const message of messages) merged.set(this.identity(message), message);
    for (const message of this.messages) {
      const archived = merged.get(this.identity(message));
      if (!archived || archived.tags['local-echo'] === '1' || message.tags['local-echo'] !== '1')
        merged.set(this.identity(message), message);
    }
    const sorted = [...merged.values()].sort((a, b) => a.timestamp - b.timestamp).slice(-this.cap);
    this.messages.length = 0;
    this.ids.clear();
    for (const message of sorted) this.add(message);
  }
  setCap(cap: number): void {
    if (!Number.isSafeInteger(cap) || cap < 1 || cap > 100000) return;
    this.cap = cap;
    if (this.messages.length > cap)
      for (const removed of this.messages.splice(0, this.messages.length - cap)) this.removeKeys(removed);
  }

  save(): void {
    try {
      localStorage.setItem(this.key, JSON.stringify(this.messages.slice(-1000)));
    } catch {
      /* Live chat continues when storage is full or unavailable. */
    }
  }
}
