import type { AuthStatus } from './auth';
import { getCompletionPreferences } from './completion-preferences';
import { parseDiscovery } from './discovery-model';
import { privacyEnabled } from './privacy';
export interface CompletionChatterContext {
  auth: AuthStatus | undefined;
  channel: string;
  viewers: number | undefined;
}
export class CompletionChatters {
  private page: { account: string; channel: string; names: string[]; at: number } | undefined;
  private abort: AbortController | undefined;
  private generation = 0;
  private nextRead = 0;
  private stopped = false;
  private expiry: ReturnType<typeof setTimeout> | undefined;
  constructor(
    private context: () => CompletionChatterContext,
    private changed: () => void,
    private fetcher: typeof fetch = fetch.bind(globalThis),
  ) {
    document.addEventListener('privacychange', this.privacy);
  }
  names(): string[] {
    const c = this.context(),
      p = getCompletionPreferences(),
      page = this.page;
    if (
      !page ||
      privacyEnabled() ||
      !p.fetchChatters ||
      !c.auth?.authenticated ||
      !c.auth.chattersEnabled ||
      page.account !== c.auth.userID ||
      page.channel !== c.channel ||
      Date.now() - page.at > 300000
    )
      return [];
    return [...page.names];
  }
  async read(): Promise<string> {
    const c = this.context(),
      p = getCompletionPreferences(),
      account = c.auth?.userID;
    if (this.stopped || privacyEnabled() || !p.fetchChatters)
      throw new Error('Enable completion chatter reads explicitly first');
    if (!account || !c.auth?.authenticated || !c.auth.chattersEnabled)
      throw new Error(
        'Chatter read consent required; use Channel discovery. Twitch also requires broadcaster/moderator access',
      );
    if (!/^[a-z0-9_]{1,25}$/.test(c.channel)) throw new Error('Invalid completion channel');
    if (p.onlySmall) {
      if (c.viewers === undefined || !Number.isSafeInteger(c.viewers) || c.viewers < 0)
        throw new Error('Viewer count unavailable; small-streamer policy blocks this read');
      if (c.viewers > p.viewerLimit) throw new Error('Stream exceeds configured viewer threshold');
    }
    if (this.abort) throw new Error('Wait for the current chatter read');
    if (Date.now() < this.nextRead) throw new Error('Wait before another chatter read');
    const generation = ++this.generation,
      abort = (this.abort = new AbortController());
    this.nextRead = Date.now() + 60000;
    try {
      const response = await this.fetcher(
        '/api/auth/discovery?' + new URLSearchParams({ kind: 'chatters', channel: c.channel }),
        {
          credentials: 'same-origin',
          cache: 'no-store',
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(30000)]),
        },
      );
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          this.page = undefined;
          this.changed();
        }
        if (response.status === 429) {
          const seconds = Number(response.headers.get('Retry-After'));
          this.nextRead = Date.now() + Math.min(3600, Math.max(60, Number.isFinite(seconds) ? seconds : 60)) * 1000;
        }
        throw new Error(
          response.status === 403
            ? 'Missing chatter permission or broadcaster/moderator role'
            : response.status === 401
              ? 'Session expired; log in again'
              : 'Completion chatter read unavailable',
        );
      }
      const page = parseDiscovery(await response.json()),
        fresh = this.context();
      if (
        this.stopped ||
        generation !== this.generation ||
        privacyEnabled() ||
        fresh.auth?.userID !== account ||
        fresh.channel !== c.channel ||
        !getCompletionPreferences().fetchChatters
      )
        throw new Error('Completion account/channel changed; result discarded');
      if (page.accountID !== account || page.channel !== c.channel || page.kind !== 'chatters')
        throw new Error('Chatter response identity mismatch');
      this.page = { account, channel: c.channel, names: [...new Set(page.items.map((x) => x.login))], at: Date.now() };
      clearTimeout(this.expiry);
      this.expiry = setTimeout(() => {
        this.page = undefined;
        this.changed();
      }, 300000);
      this.changed();
      return (
        'Loaded ' +
        this.page.names.length +
        ' completion names from one page; additional pages are not fetched. Names expire after five minutes; chatters are not viewer count.'
      );
    } finally {
      if (generation === this.generation) this.abort = undefined;
    }
  }
  private privacy = (): void => {
    if (privacyEnabled()) {
      this.generation++;
      this.abort?.abort();
      this.abort = undefined;
      clearTimeout(this.expiry);
      this.page = undefined;
      this.changed();
    }
  };
  stop(): void {
    this.stopped = true;
    this.generation++;
    this.abort?.abort();
    this.abort = undefined;
    clearTimeout(this.expiry);
    this.page = undefined;
    document.removeEventListener('privacychange', this.privacy);
  }
}
