import { showPanel } from './shell/open-panel';
import type { Panel } from './shell/panels';
import { clockTask, stopClockTask } from './shell/clock';
import type { AuthStatus } from './auth';
import { privacyEnabled } from './privacy';
import { parseDiscovery, type DiscoveryKind, type DiscoveryPage } from './discovery-model';
export { parseDiscovery } from './discovery-model';
export type { DiscoveryKind, DiscoveryItem, DiscoveryPage } from './discovery-model';
export class DiscoveryPanel implements Panel {
  readonly id = 'discovery-panel';
  readonly title = 'Channels';
  readonly group = 'chat';
  readonly root = document.createElement('dialog');
  private auth: AuthStatus | undefined;
  private page: DiscoveryPage | undefined;
  private pageNumber = 0;
  private generation = 0;
  private abort: AbortController | undefined;
  private busy = false;
  private retryAt = 0;
  private stopped = false;
  private kind = document.createElement('select');
  private channel = document.createElement('select');
  private search = document.createElement('input');
  private load = document.createElement('button');
  private next = document.createElement('button');
  private result = document.createElement('section');
  private status = document.createElement('p');
  private age = document.createElement('p');
  private consent = document.createElement('a');
  private timer: ReturnType<typeof clockTask> | undefined;
  constructor(
    private channels: readonly string[],
    private join: (login: string) => void,
    private fetcher: typeof fetch = (input, init) => fetch(input, init),
  ) {
    this.root.id = 'discovery-panel';
    this.root.id = this.id;
    this.root.setAttribute('aria-label', 'Channel discovery');
    const h = document.createElement('h2');
    h.textContent = 'Channel discovery';
    const note = document.createElement('p');
    note.textContent =
      'Followed lists use this app’s signed-in account, separately from the video iframe login. Chatter lists require broadcaster or moderator access and may lag behind joins/leaves; chatters are not a viewer count. Each load reads one page, at most 100 names. Search filters only the current page. No automatic refresh.';
    this.root.append(h, note);
    const label = (name: string, input: HTMLElement) => {
      const l = document.createElement('label');
      l.append(name + ' ', input);
      this.root.append(l);
    };
    for (const [value, name] of [
      ['live', 'Live followed channels'],
      ['followed', 'All followed channels'],
      ['chatters', 'Channel chatters'],
    ]) {
      const o = document.createElement('option');
      o.value = value!;
      o.textContent = name!;
      this.kind.append(o);
    }
    label('List', this.kind);
    this.kind.setAttribute('aria-label', 'Discovery list');
    for (const name of channels) {
      const o = document.createElement('option');
      o.value = name;
      o.textContent = '#' + name;
      this.channel.append(o);
    }
    this.channel.setAttribute('aria-label', 'Chatter channel');
    label('Chatter channel', this.channel);
    this.search.type = 'search';
    this.search.maxLength = 100;
    this.search.setAttribute('aria-label', 'Search current discovery page');
    label('Search current page', this.search);
    this.search.addEventListener('input', () => this.paintRows());
    this.load.type = this.next.type = 'button';
    this.load.textContent = 'Load first page';
    this.next.textContent = 'Next page';
    this.load.addEventListener('click', () => void this.request(false));
    this.next.addEventListener('click', () => void this.request(true));
    this.kind.addEventListener('change', this.reset);
    this.channel.addEventListener('change', this.reset);
    this.status.setAttribute('role', 'status');
    this.consent.textContent = 'Grant read permission through Twitch';
    this.consent.addEventListener('click', (e) => {
      if (privacyEnabled() || !this.auth?.enabled) {
        e.preventDefault();
        return;
      }
    });
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Close';
    close.addEventListener('click', () => this.root.close());
    this.root.append(this.consent, this.load, this.next, close, this.status, this.age, this.result);
    this.root.addEventListener('close', this.closed);
    document.addEventListener('privacychange', this.privacy);
    window.addEventListener('storage', this.privacy);
    document.body.append(this.root);
    this.paintState();
  }
  setAuth(auth: AuthStatus | undefined): void {
    const identity = (a: AuthStatus | undefined) =>
      [a?.enabled, a?.authenticated, a?.userID, a?.followsEnabled, a?.chattersEnabled].join(':');
    const changed = identity(auth) !== identity(this.auth);
    this.auth = auth;
    if (changed) this.reset();
    this.paintState();
  }
  private currentKind(): DiscoveryKind {
    return this.kind.value === 'chatters' ? 'chatters' : this.kind.value === 'followed' ? 'followed' : 'live';
  }
  private allowed(): boolean {
    return (
      !!this.auth?.authenticated &&
      (this.currentKind() === 'chatters' ? !!this.auth.chattersEnabled : !!this.auth.followsEnabled)
    );
  }
  private reset = (): void => {
    this.generation++;
    this.abort?.abort();
    this.abort = undefined;
    this.busy = false;
    this.page = undefined;
    this.pageNumber = 0;
    this.result.replaceChildren();
    this.age.textContent = '';
    this.status.textContent = '';
    this.paintState();
  };
  open = (): void => {
    if (privacyEnabled()) return;
    this.paintState();
    showPanel(this.root);
    this.timer ??= clockTask('discovery.paint', () => this.paintState(), 1000, { active: () => this.root.open });
  };
  private closed = (): void => {
    stopClockTask(this.timer);
    this.timer = undefined;
    this.generation++;
    this.abort?.abort();
    this.busy = false;
    this.paintState();
  };
  private privacy = (): void => {
    if (privacyEnabled()) {
      this.reset();
      if (this.root.open) this.root.close();
    }
  };
  private paintState(): void {
    this.channel.disabled = this.currentKind() !== 'chatters' || this.busy;
    this.kind.disabled = this.busy;
    this.load.disabled = this.busy || !this.allowed() || Date.now() < this.retryAt || privacyEnabled();
    this.next.disabled = this.load.disabled || !this.page?.after;
    this.consent.hidden = this.allowed() || !this.auth?.enabled;
    if (this.auth) {
      const url = new URL(this.auth.loginURL);
      url.searchParams.set('discovery', this.currentKind() === 'chatters' ? 'chatters' : 'follows');
      url.searchParams.set('channel', this.channels.join(','));
      this.consent.href = url.href;
    }
    if (!this.allowed() && !this.busy)
      this.status.textContent = !this.auth
        ? 'Waiting for Twitch login status'
        : !this.auth.enabled
          ? 'Twitch login is not configured'
          : !this.auth.authenticated
            ? 'Log in and grant read permission to load this list'
            : this.currentKind() === 'chatters'
              ? 'Grant moderator:read:chatters; Twitch must also confirm broadcaster/moderator access'
              : 'Grant user:read:follows to load followed channels';
    if (this.allowed() && !this.busy && !this.page && !this.status.textContent)
      this.status.textContent = 'Ready; load one page';
    if (this.page)
      this.age.textContent =
        'Page ' +
        this.pageNumber +
        ' · ' +
        this.page.items.length +
        ' returned' +
        (this.currentKind() !== 'live' ? ' · ' + this.page.total + ' reported total' : '') +
        ' · observed ' +
        Math.max(0, Math.floor((Date.now() - this.page.observedAt) / 1000)) +
        ' seconds ago' +
        (this.page.after ? ' · more pages available' : ' · end of list');
  }
  private paintRows(): void {
    this.result.replaceChildren();
    if (privacyEnabled() || !this.page) return;
    const query = this.search.value.toLowerCase();
    for (const item of this.page.items) {
      if (![item.login, item.name, item.title, item.category].join(' ').toLowerCase().includes(query)) continue;
      const row = document.createElement('p'),
        name = document.createElement('a');
      name.href = 'https://www.twitch.tv/' + item.login;
      name.target = '_blank';
      name.rel = 'noopener noreferrer';
      name.textContent = item.name + ' (' + item.login + ')';
      row.append(name);
      if (this.page.kind === 'live')
        row.append(' · ' + item.viewers + ' viewers · ' + item.category + ' · ' + item.title);
      if (this.page.kind !== 'chatters') {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = this.channels.includes(item.login) ? 'Already joined' : 'Join workspace';
        b.disabled = this.channels.includes(item.login);
        b.addEventListener('click', () => {
          if (privacyEnabled()) return;
          try {
            this.join(item.login);
          } catch (e) {
            this.status.textContent = e instanceof Error ? e.message : 'Could not join channel';
          }
        });
        row.append(b);
      }
      this.result.append(row);
    }
    if (!this.result.childNodes.length) this.result.textContent = 'No matches on this page';
  }
  private async request(next: boolean): Promise<void> {
    if (this.busy || !this.allowed() || privacyEnabled() || Date.now() < this.retryAt) return;
    const kind = this.currentKind(),
      channel = kind === 'chatters' ? this.channel.value : '',
      accountID = this.auth?.userID,
      generation = ++this.generation;
    this.abort?.abort();
    const controller = new AbortController();
    this.abort = controller;
    this.busy = true;
    this.status.textContent = 'Loading one page…';
    this.paintState();
    try {
      const q = new URLSearchParams({ kind });
      if (channel) q.set('channel', channel);
      if (next && this.page?.after) q.set('after', this.page.after);
      const response = await this.fetcher('/api/auth/discovery?' + q, {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
      });
      if (generation !== this.generation || this.stopped || privacyEnabled()) return;
      if (!response.ok) {
        if (response.status === 429) {
          const seconds = Number(response.headers.get('Retry-After'));
          this.retryAt = Date.now() + Math.min(3600, Math.max(60, Number.isFinite(seconds) ? seconds : 60)) * 1000;
        }
        throw new Error(
          response.status === 403
            ? 'Missing read permission or broadcaster/moderator role'
            : response.status === 401
              ? 'Session expired; log in again'
              : response.status === 429
                ? 'Rate limited; wait before loading another page'
                : 'Channel discovery unavailable',
        );
      }
      const page = parseDiscovery(await response.json());
      if (generation !== this.generation || this.stopped || privacyEnabled()) return;
      if (page.accountID !== accountID || page.kind !== kind || page.channel !== channel)
        throw new Error('Discovery account/context changed; reload');
      this.page = page;
      this.pageNumber = next ? this.pageNumber + 1 : 1;
      this.status.textContent = 'Loaded one page';
      this.paintRows();
    } catch (e) {
      if (generation === this.generation && !controller.signal.aborted)
        this.status.textContent = e instanceof Error ? e.message : 'Discovery unavailable';
    } finally {
      if (generation === this.generation) {
        this.busy = false;
        this.paintState();
      }
    }
  }
  close(): void {
    this.root.close();
  }
  stop(): void {
    this.stopped = true;
    this.reset();
    stopClockTask(this.timer);
    document.removeEventListener('privacychange', this.privacy);
    window.removeEventListener('storage', this.privacy);
    this.root.remove();
  }
}
