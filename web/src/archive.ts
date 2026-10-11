import { parseEvent, type ChatMessage } from './protocol';
interface Archived { key: string; channel: string; timestamp: number; message: ChatMessage }
export interface ArchiveQuery { text: string; channel?: string; login?: string; before?: number; after?: number; limit?: number }
const MAX_ROWS = 100000;
function validMessage(value: unknown): ChatMessage | undefined {
  const event = parseEvent(JSON.stringify({ type: 'message', message: value, replay: true }));
  return event?.type === 'message' ? event.message : undefined;
}
export function matchesArchive(message: ChatMessage, query: ArchiveQuery): boolean {
  return (!query.channel || message.channel === query.channel)
    && (!query.login || message.login.toLowerCase() === query.login.toLowerCase())
    && (query.before === undefined || message.timestamp <= query.before)
    && (query.after === undefined || message.timestamp >= query.after)
    && (!query.text.trim() || (message.text + ' ' + (message.tags['system-msg'] ?? '')).toLowerCase().includes(query.text.trim().toLowerCase()));
}
function request<T>(req: IDBRequest<T>): Promise<T> { return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error ?? new Error('Archive request failed')); }); }
function done(tx: IDBTransaction): Promise<void> { return new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error ?? new Error('Archive transaction aborted')); tx.onerror = () => reject(tx.error ?? new Error('Archive transaction failed')); }); }
export class MessageArchive {
  private db: Promise<IDBDatabase>;
  private queue: ChatMessage[] = [];
  private flushing: Promise<void> | undefined;
  private stopped = false;
  private timer: ReturnType<typeof setInterval>;
  constructor(private readonly failure: (message: string) => void = () => {}, private readonly cap = MAX_ROWS) {
    this.db = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return; }
      const open = indexedDB.open('chatthing-archive', 1);
      open.onupgradeneeded = () => {
        const store = open.result.createObjectStore('messages', { keyPath: 'key' });
        store.createIndex('timestamp', 'timestamp'); store.createIndex('channel-time', ['channel', 'timestamp']);
      };
      open.onsuccess = () => { open.result.onversionchange = () => open.result.close(); resolve(open.result); };
      open.onerror = () => reject(open.error ?? new Error('Archive unavailable'));
      open.onblocked = () => failure('Archive upgrade is blocked by another tab; close it and reload');
    });
    void this.db.catch(() => failure('Local archive unavailable; live chat continues'));
    this.timer = setInterval(() => { void this.flush().catch(() => failure('Archive could not save messages; live chat continues')); }, 3000);
  }
  add(message: ChatMessage): void {
    if (this.stopped || !['PRIVMSG', 'USERNOTICE', 'NOTICE', 'CLEARCHAT', 'CLEARMSG'].includes(message.command)) return;
    this.queue.push(message); if (this.queue.length > 2000) { this.queue.shift(); this.failure('Archive backlog is full; some messages could not be saved'); }
  }
  async flush(): Promise<void> {
    if (this.flushing) { await this.flushing; if (this.queue.length) await this.flush(); return; }
    if (!this.queue.length) return;
    this.flushing = this.write();
    try { await this.flushing; } finally { this.flushing = undefined; }
  }
  private async write(): Promise<void> {
    const db = await this.db; const batch = this.queue.splice(0);
    const tx = db.transaction('messages', 'readwrite'); const complete = done(tx); const store = tx.objectStore('messages');
    for (const message of batch) {
      const key = message.channel + ':' + (message.id || [message.command, message.timestamp, message.login, message.text, message.tags['system-msg'] ?? ''].join(':'));
      store.put({ key, channel: message.channel, timestamp: message.timestamp, message } satisfies Archived);
    }
    try { await complete; } catch (error) {
      this.queue = [...batch, ...this.queue].slice(-2000); throw error;
    }
    const pruning = db.transaction('messages', 'readwrite'); const finish = done(pruning); const records = pruning.objectStore('messages');
    const total = await request(records.count()); let remaining = total - Math.max(1, Math.min(MAX_ROWS, this.cap));
    if (remaining > 0) await new Promise<void>((resolve, reject) => {
      const cursor = records.index('timestamp').openCursor(); cursor.onerror = () => reject(cursor.error);
      cursor.onsuccess = () => { if (!cursor.result || remaining <= 0) { resolve(); return; } cursor.result.delete(); remaining--; cursor.result.continue(); };
    });
    await finish;
  }
  async get(id: string, channels: readonly string[]): Promise<ChatMessage | undefined> {
    await this.flush(); const db = await this.db; const tx = db.transaction('messages', 'readonly'); const complete = done(tx);
    const values = await Promise.all(channels.map(channel => request(tx.objectStore('messages').get(channel + ':' + id)) as Promise<Archived | undefined>));
    await complete; return values.flatMap(value => { const message = value ? validMessage(value.message) : undefined; return message ? [message] : []; })[0];
  }
  async recent(channels: readonly string[], limit: number, signal?: AbortSignal): Promise<ChatMessage[]> {
    return (await this.read({ text: '', limit }, signal, new Set(channels), MAX_ROWS)).reverse();
  }
  async search(query: ArchiveQuery, signal?: AbortSignal): Promise<ChatMessage[]> { return this.read(query, signal); }
  private async read(query: ArchiveQuery, signal?: AbortSignal, channels?: Set<string>, max = 500): Promise<ChatMessage[]> {
    await this.flush(); if (signal?.aborted) throw new DOMException('Search cancelled', 'AbortError');
    const db = await this.db; const tx = db.transaction('messages', 'readonly'); const complete = done(tx);
    const source = tx.objectStore('messages'); const index = query.channel ? source.index('channel-time') : source.index('timestamp');
    const lower = Math.max(0, query.after ?? 0); const upper = Math.min(8640000000000000, query.before ?? 8640000000000000);
    if (lower > upper) { await complete; return []; }
    const range = query.channel ? IDBKeyRange.bound([query.channel, lower], [query.channel, upper]) : IDBKeyRange.bound(lower, upper);
    const results: ChatMessage[] = []; const limit = Math.max(1, Math.min(max, Number.isFinite(query.limit) ? Math.floor(query.limit ?? 100) : 100));
    await new Promise<void>((resolve, reject) => {
      const cursor = index.openCursor(range, 'prev'); cursor.onerror = () => reject(cursor.error);
      cursor.onsuccess = () => {
        if (signal?.aborted) { reject(new DOMException('Search cancelled', 'AbortError')); return; }
        const row = cursor.result; if (!row || results.length >= limit) { resolve(); return; }
        const record = row.value as Partial<Archived>; const message = validMessage(record.message);
        if (message && (!channels || channels.has(message.channel)) && matchesArchive(message, query)) results.push(message); row.continue();
      };
    });
    await complete; return results;
  }
  stop(): void { this.stopped = true; clearInterval(this.timer); void this.flush().then(async () => (await this.db).close()).catch(() => {}); }
}
