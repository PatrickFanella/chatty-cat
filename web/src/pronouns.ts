const LABELS: Record<string, string> = {
  hehim: 'he/him',
  sheher: 'she/her',
  theythem: 'they/them',
  any: 'any',
  other: 'other',
  xexem: 'xe/xem',
  faefaer: 'fae/faer',
  vever: 've/ver',
  aeaer: 'ae/aer',
  ziehir: 'zie/hir',
  perper: 'per/per',
  eem: 'e/em',
  itits: 'it/its',
};
export function parsePronouns(value: unknown): string {
  if (!Array.isArray(value) || value.length > 1) throw new Error('Invalid pronoun response');
  if (!value.length) return '';
  const user = value[0] as Record<string, unknown>;
  if (
    !user ||
    typeof user !== 'object' ||
    typeof user.pronoun_id !== 'string' ||
    !/^[a-z]{1,24}$/.test(user.pronoun_id)
  )
    throw new Error('Invalid pronoun identifier');
  return LABELS[user.pronoun_id] ?? user.pronoun_id;
}
interface Entry {
  label: string;
  until: number;
}
export class Pronouns {
  private cache = new Map<string, Entry>();
  private failures = new Map<string, number>();
  private pending = new Map<string, Promise<string | undefined>>();
  private queue: { login: string; resolve: (label: string | undefined) => void }[] = [];
  private running = false;
  private stopped = false;
  private abort = new AbortController();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private finishDelay: (() => void) | undefined;
  constructor() {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem('chatthing:v1:pronouns') ?? 'null');
      if (Array.isArray(saved))
        for (const pair of saved.slice(-1000)) {
          if (!Array.isArray(pair) || pair.length !== 2) continue;
          const [login, data] = pair as [unknown, unknown];
          if (typeof login !== 'string' || !/^[a-z0-9_]{1,25}$/.test(login) || !data || typeof data !== 'object')
            continue;
          const entry = data as Entry;
          if (
            typeof entry.label === 'string' &&
            entry.label.length <= 32 &&
            typeof entry.until === 'number' &&
            Number.isFinite(entry.until) &&
            entry.until > Date.now() &&
            entry.until <= Date.now() + 30 * 86400000
          )
            this.cache.set(login, entry);
        }
    } catch {
      /* optional storage */
    }
  }
  get(login: string): Promise<string | undefined> {
    login = login.toLowerCase();
    if (this.stopped || !/^[a-z0-9_]{1,25}$/.test(login)) return Promise.resolve(undefined);
    if ((this.failures.get(login) ?? 0) > Date.now()) return Promise.resolve(undefined);
    const cached = this.cache.get(login);
    if (cached && cached.until > Date.now()) return Promise.resolve(cached.label);
    const pending = this.pending.get(login);
    if (pending) return pending;
    if (this.pending.size >= 32) return Promise.resolve(undefined);
    const result = new Promise<string | undefined>((resolve) => {
      this.queue.push({ login, resolve });
    });
    this.pending.set(login, result);
    void this.drain();
    return result;
  }
  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    while (this.queue.length && !this.stopped) {
      const item = this.queue.shift()!;
      let label: string | undefined;
      try {
        const response = await fetch('https://pronouns.alejo.io/api/users/' + item.login, {
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(10000)]),
        });
        if (!response.ok || Number(response.headers.get('content-length') ?? 0) > 16384)
          throw new Error('Pronouns unavailable');
        const reader = response.body?.getReader();
        if (!reader) throw new Error('Missing pronoun response');
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            size += value.length;
            if (size > 16384) throw new Error('Pronoun response too large');
            chunks.push(value);
          }
        } finally {
          await reader.cancel();
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
        label = parsePronouns(JSON.parse(new TextDecoder().decode(bytes)));
        if (!this.stopped) {
          this.cache.delete(item.login);
          this.cache.set(item.login, { label, until: Date.now() + (label ? 30 : 7) * 86400000 });
          while (this.cache.size > 1000) {
            const first = this.cache.keys().next().value;
            if (first) this.cache.delete(first);
            else break;
          }
          try {
            localStorage.setItem('chatthing:v1:pronouns', JSON.stringify([...this.cache]));
          } catch {
            /* optional storage */
          }
        }
      } catch {
        if (!this.stopped) {
          this.failures.set(item.login, Date.now() + 60000);
          while (this.failures.size > 256) {
            const first = this.failures.keys().next().value;
            if (first) this.failures.delete(first);
            else break;
          }
        }
      }
      item.resolve(this.stopped ? undefined : label);
      this.pending.delete(item.login);
      if (!this.stopped && this.queue.length)
        await new Promise<void>((resolve) => {
          this.finishDelay = resolve;
          this.timer = setTimeout(() => {
            this.timer = undefined;
            this.finishDelay = undefined;
            resolve();
          }, 300);
        });
    }
    this.running = false;
  }
  stop(): void {
    this.stopped = true;
    this.abort.abort();
    clearTimeout(this.timer);
    this.finishDelay?.();
    for (const item of this.queue) item.resolve(undefined);
    this.queue = [];
    this.pending.clear();
  }
}
