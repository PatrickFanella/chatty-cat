import type { AuthStatus } from './auth';
import type { Emote } from './tokens';

export function parseAccountEmotes(value: unknown): { emotes: Emote[]; after: string } {
  if (!value || typeof value !== 'object') throw new Error('Invalid account emotes');
  const data = value as Record<string, unknown>;
  if (
    !Array.isArray(data.emotes) ||
    data.emotes.length > 1000 ||
    typeof data.after !== 'string' ||
    data.after.length > 512 ||
    /[\x00-\x1f\x7f]/.test(data.after)
  )
    throw new Error('Invalid account emotes');
  const emotes: Emote[] = [];
  for (const value of data.emotes) {
    if (!value || typeof value !== 'object') throw new Error('Invalid account emote');
    const e = value as Record<string, unknown>;
    if (
      typeof e.code !== 'string' ||
      !e.code ||
      [...e.code].length > 100 ||
      /\s|[\x00-\x1f\x7f]/.test(e.code) ||
      e.source !== 'Twitch' ||
      typeof e.animated !== 'boolean' ||
      e.zeroWidth !== false
    )
      throw new Error('Invalid account emote');
    for (const key of ['url', 'staticUrl']) {
      if (
        typeof e[key] !== 'string' ||
        !/^https:\/\/static-cdn\.jtvnw\.net\/emoticons\/v2\/[A-Za-z0-9_-]{1,128}\/(static|animated)\/(light|dark)\/[123]\.0$/.test(
          e[key] as string,
        )
      )
        throw new Error('Invalid account emote URL');
    }
    emotes.push({
      code: e.code,
      url: e.url as string,
      staticUrl: e.staticUrl as string,
      source: 'Twitch',
      animated: e.animated,
      zeroWidth: false,
    });
  }
  return { emotes, after: data.after };
}

export class AccountEmotes {
  private identity = '';
  private channel = '';
  private auth: AuthStatus | undefined;
  private abort = new AbortController();
  private stopped = false;
  private loadedAt = 0;
  constructor(
    private readonly receive: (emotes: Emote[]) => void,
    private readonly status: HTMLElement,
  ) {}
  update(auth: AuthStatus | undefined, channel: string): void {
    const identity = auth?.authenticated ? (auth.userID ?? '') : '';
    const changed =
      identity !== this.identity || channel !== this.channel || auth?.emotesEnabled !== this.auth?.emotesEnabled;
    this.auth = auth;
    if (this.stopped || (!changed && Date.now() - this.loadedAt < 300000)) return;
    this.identity = identity;
    this.channel = channel;
    this.loadedAt = Date.now();
    this.abort.abort();
    this.abort = new AbortController();
    this.receive([]);
    this.status.textContent = '';
    if (!identity) return;
    if (!auth?.emotesEnabled) {
      this.status.textContent = 'Sign out and log in again to enable account emotes';
      return;
    }
    void this.load(this.abort.signal, channel);
  }
  stop(): void {
    this.stopped = true;
    this.abort.abort();
  }
  private async load(signal: AbortSignal, channel: string): Promise<void> {
    this.status.textContent = 'Loading account emotes…';
    const emotes = new Map<string, Emote>();
    const cursors = new Set<string>();
    let after = '';
    try {
      for (let page = 0; page < 50; page++) {
        const query = new URLSearchParams({ channel });
        if (after) query.set('after', after);
        const response = await fetch('/api/auth/emotes?' + query, {
          credentials: 'same-origin',
          cache: 'no-store',
          signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
        });
        if (!response.ok)
          throw new Error(
            response.status === 403
              ? 'Sign out and log in again to enable account emotes'
              : 'Account emotes unavailable; retry by reopening chat',
          );
        const data = parseAccountEmotes(await response.json());
        for (const emote of data.emotes) emotes.set(emote.code, emote);
        if (emotes.size > 10000 || (data.after && cursors.has(data.after)))
          throw new Error('Account emote list exceeded its safe limit');
        after = data.after;
        if (!after) {
          if (!signal.aborted) {
            this.receive([...emotes.values()]);
            this.status.textContent = `${emotes.size} account emotes`;
          }
          return;
        }
        cursors.add(after);
      }
      throw new Error('Account emote list exceeded its page limit');
    } catch (error) {
      if (!signal.aborted)
        this.status.textContent = error instanceof Error ? error.message : 'Account emotes unavailable';
    }
  }
}
