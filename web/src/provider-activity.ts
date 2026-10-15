import { ownedInterval, clearOwnedInterval } from './resource-timers';
import { loadAuth, type AuthStatus } from './auth';
import { getProfileScope } from './account-profiles';
import { privacyEnabled } from './privacy';
import { getProviderPreferences } from './provider-preferences';
import { parseProviderCapabilities, record, type LiveProvider } from './provider-events-model';

interface Context {
  channel: string;
  broadcasterID: string;
}
interface Reviewed {
  key: string;
  auth: AuthStatus;
  context: Context;
  providers: LiveProvider[];
  sevenTVUser: string;
  at: number;
}
const PERIOD = 300000;
async function boundedJSON(response: Response, limit: number): Promise<unknown> {
  if (!response.ok) throw new Error('Provider read unavailable');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Missing provider response');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw new Error('Provider response exceeds limit');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
// A reviewed session shares only the current account and one fixed selected channel.
export class ProviderActivity {
  private generation = 0;
  private abort = new AbortController();
  private pending: Reviewed | undefined;
  private active: Reviewed | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private nextAt = 0;
  private busy = false;
  private attempts = new Map<string, number>();
  private disposed = false;
  get running(): boolean {
    return this.active !== undefined;
  }
  constructor(
    private auth: () => AuthStatus | undefined,
    private channel: () => Context | undefined,
    private bttv: (auth: AuthStatus, channelID: string) => boolean,
    private status: (detail: string) => void,
  ) {
    document.addEventListener('privacychange', this.privacy);
  }
  private context(): { key: string; auth: AuthStatus; context: Context; providers: LiveProvider[] } {
    const auth = this.auth(),
      context = this.channel(),
      p = getProviderPreferences();
    if (
      this.disposed ||
      privacyEnabled() ||
      !auth?.authenticated ||
      !auth.userID ||
      !/^\d{1,32}$/.test(auth.userID) ||
      getProfileScope() !== auth.userID ||
      !auth.csrf ||
      !context ||
      !/^\d{1,32}$/.test(context.broadcasterID) ||
      !/^[a-z0-9_]{1,25}$/.test(context.channel)
    )
      throw new Error(
        'Activity requires the current signed-in account and a joined selected channel outside privacy mode',
      );
    const providers = (['BTTV', '7TV'] as const).filter((provider) => p.activity[provider]);
    if (!providers.length) throw new Error('Review and enable provider activity preferences first');
    return {
      key: JSON.stringify([auth.userID, auth.csrf, context.channel, context.broadcasterID, providers]),
      auth,
      context: { ...context },
      providers,
    };
  }
  private check(row: Reviewed, generation: number): void {
    if (generation !== this.generation || this.context().key !== row.key)
      throw new Error('Activity context changed; review again');
  }
  private signal(): AbortSignal {
    return AbortSignal.any([this.abort.signal, AbortSignal.timeout(12000)]);
  }
  private async fresh(row: Reviewed, generation: number): Promise<void> {
    this.check(row, generation);
    const auth = await loadAuth(this.signal());
    this.check(row, generation);
    if (!auth.authenticated || auth.userID !== row.auth.userID || auth.csrf !== row.auth.csrf)
      throw new Error('Authentication changed; review activity again');
    const response = await fetch('/api/provider-services/config', {
      credentials: 'omit',
      cache: 'no-store',
      signal: this.signal(),
    });
    const allowed = parseProviderCapabilities(await boundedJSON(response, 4096));
    this.check(row, generation);
    if (!allowed || row.providers.some((p) => !allowed.includes(p)))
      throw new Error('Selected activity services are not configured on this server');
  }
  private cooldown(row: Reviewed): void {
    for (const provider of row.providers)
      if (
        Date.now() -
          (this.attempts.get(provider + ':' + row.auth.userID + ':' + row.context.broadcasterID) ?? -Infinity) <
        PERIOD
      )
        throw new Error('Wait five minutes between activity attempts for this account and channel');
  }
  async review(): Promise<string> {
    this.cancel();
    const current = this.context(),
      generation = this.generation;
    const row: Reviewed = { ...current, sevenTVUser: '', at: Date.now() };
    this.cooldown(row);
    await this.fresh(row, generation);
    if (row.providers.includes('7TV')) {
      const response = await fetch('https://7tv.io/v3/users/twitch/' + encodeURIComponent(row.auth.userID!), {
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
        signal: this.signal(),
      });
      const v = await boundedJSON(response, 1024 * 1024);
      this.check(row, generation);
      if (
        !record(v) ||
        v.id !== row.auth.userID ||
        v.platform !== 'TWITCH' ||
        !record(v.user) ||
        typeof v.user.id !== 'string' ||
        !/^[A-Za-z0-9_-]{1,100}$/.test(v.user.id)
      )
        throw new Error('A matching linked 7TV account is required for activity');
      row.sevenTVUser = v.user.id;
    }
    this.check(row, generation);
    row.at = Date.now();
    this.pending = row;
    return (
      'Share ' +
      row.auth.login +
      ' (Twitch ' +
      row.auth.userID +
      ') in #' +
      row.context.channel +
      ' (Twitch ' +
      row.context.broadcasterID +
      ') with ' +
      row.providers.join(' and ') +
      '. Start sends an announcement now and every five minutes in this page. Stop, privacy, account/channel changes or leaving the page ends the session. BTTV sends are not delivery receipts. Review expires in 60 seconds.'
    );
  }
  async start(): Promise<void> {
    const row = this.pending;
    if (!row || Date.now() - row.at > 60000) throw new Error('Review provider activity first');
    const generation = this.generation;
    this.check(row, generation);
    this.cooldown(row);
    this.pending = undefined;
    this.active = row;
    this.busy = true;
    this.timer = ownedInterval('provider.activity', this.tick, 1000);
    try {
      await this.send(row, generation);
      this.check(row, generation);
      this.nextAt = Date.now() + PERIOD;
      this.status(
        'Provider activity active for #' +
          row.context.channel +
          ' · ' +
          row.providers.join(', ') +
          ' · every five minutes.',
      );
    } catch (error) {
      if (generation === this.generation) this.cancel();
      throw error;
    } finally {
      if (generation === this.generation) this.busy = false;
    }
  }
  private async send(row: Reviewed, generation: number): Promise<void> {
    await this.fresh(row, generation);
    this.cooldown(row);
    for (const provider of row.providers) {
      this.check(row, generation);
      const key = provider + ':' + row.auth.userID + ':' + row.context.broadcasterID;
      this.attempts.delete(key);
      this.attempts.set(key, Date.now());
      while (this.attempts.size > 48) this.attempts.delete(this.attempts.keys().next().value!);
      if (provider === 'BTTV') {
        if (!this.bttv(row.auth, row.context.broadcasterID))
          throw new Error(
            'BTTV announcement unavailable; reconnect its read service and review again after the attempt cooldown',
          );
      } else {
        const response = await fetch('https://7tv.io/v3/users/' + encodeURIComponent(row.sevenTVUser) + '/presences', {
          method: 'POST',
          credentials: 'omit',
          redirect: 'error',
          referrerPolicy: 'no-referrer',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 1, data: { id: row.context.broadcasterID, platform: 'TWITCH' } }),
          signal: this.signal(),
        });
        this.check(row, generation);
        await response.body?.cancel();
        if (!response.ok) throw new Error('7TV presence was not accepted; the session stopped without automatic retry');
      }
    }
  }
  private tick = (): void => {
    const row = this.active;
    if (!row) return;
    const generation = this.generation;
    try {
      this.check(row, generation);
    } catch {
      this.cancel();
      this.status('Provider activity stopped because the account, channel or preferences changed.');
      return;
    }
    if (this.busy || Date.now() < this.nextAt) return;
    this.busy = true;
    void this.send(row, generation)
      .then(() => {
        if (generation === this.generation) this.nextAt = Date.now() + PERIOD;
      })
      .catch(() => {
        if (generation === this.generation) {
          this.cancel();
          this.status(
            'Provider activity stopped after an unsuccessful or unconfirmed attempt. No automatic retry; previous attempts may have reached the provider.',
          );
        }
      })
      .finally(() => {
        if (generation === this.generation) this.busy = false;
      });
  };
  cancel(): void {
    this.generation++;
    this.abort.abort();
    this.abort = new AbortController();
    clearOwnedInterval(this.timer);
    this.timer = undefined;
    this.pending = undefined;
    this.active = undefined;
    this.busy = false;
  }
  authChanged(): void {
    try {
      if (this.active) this.check(this.active, this.generation);
      if (this.pending) this.check(this.pending, this.generation);
    } catch {
      this.cancel();
      this.status('Provider activity stopped after authentication changed.');
    }
  }
  private privacy = (): void => {
    if (privacyEnabled()) {
      this.cancel();
      this.status('Provider activity stopped by privacy mode.');
    }
  };
  dispose(): void {
    this.cancel();
    this.disposed = true;
    document.removeEventListener('privacychange', this.privacy);
  }
}
