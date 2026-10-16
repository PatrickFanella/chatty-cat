import { showPanel } from './shell/open-panel';
import type { Panel } from './shell/panels';
import type { AuthStatus } from './auth';
import { privacyEnabled } from './privacy';
interface UserHoldRow {
  id: string;
  eventID: string;
  text: string;
  status: 'held' | 'approved' | 'denied' | 'invalid';
  at: number;
}
export interface UserHoldSnapshot {
  format: 'chatty-cat-private-user-holds';
  account: string;
  channel: string;
  broadcasterID: string;
  epoch: string;
  state: 'connecting' | 'live' | 'unavailable';
  active: boolean;
  detail: string;
  rows: UserHoldRow[];
}
function record(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
function id(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
}
function status(v: unknown): v is UserHoldRow['status'] {
  return v === 'held' || v === 'approved' || v === 'denied' || v === 'invalid';
}
export function parseUserHolds(raw: unknown, account: string, channel: string): UserHoldSnapshot {
  if (
    !record(raw) ||
    raw.format !== 'chatty-cat-private-user-holds' ||
    raw.account !== account ||
    raw.channel !== channel ||
    typeof raw.broadcasterID !== 'string' ||
    !/^[0-9]{1,32}$/.test(raw.broadcasterID) ||
    typeof raw.epoch !== 'string' ||
    !/^[A-Za-z0-9_-]{16,64}$/.test(raw.epoch) ||
    (raw.state !== 'connecting' && raw.state !== 'live' && raw.state !== 'unavailable') ||
    typeof raw.active !== 'boolean' ||
    raw.active !== (raw.state === 'live') ||
    typeof raw.detail !== 'string' ||
    raw.detail.length > 300 ||
    !Array.isArray(raw.rows) ||
    raw.rows.length > 100 ||
    (!raw.active && raw.rows.length)
  )
    throw new Error('Private feedback scope/state changed');
  const rows: UserHoldRow[] = raw.rows.map((row) => {
    if (
      !record(row) ||
      !id(row.id) ||
      !id(row.eventID) ||
      typeof row.text !== 'string' ||
      row.text.length > 2000 ||
      [...row.text].length > 500 ||
      !status(row.status) ||
      typeof row.at !== 'number' ||
      !Number.isSafeInteger(row.at) ||
      row.at < 0 ||
      row.at > Date.now() + 300000
    )
      throw new Error('Invalid private feedback row');
    return { id: row.id, eventID: row.eventID, text: row.text, status: row.status, at: row.at };
  });
  if (new Set(rows.map((r) => r.id)).size !== rows.length) throw new Error('Duplicate private feedback');
  return {
    format: 'chatty-cat-private-user-holds',
    account,
    channel,
    broadcasterID: raw.broadcasterID,
    epoch: raw.epoch,
    state: raw.state,
    active: raw.active,
    detail: raw.detail,
    rows,
  };
}
export class UserHoldPanel implements Panel {
  readonly id = 'user-hold-panel';
  readonly title = 'Own message feedback';
  readonly group = 'account';
  readonly root = document.createElement('dialog');
  private channel = document.createElement('select');
  private status = document.createElement('p');
  private list = document.createElement('div');
  private consent = document.createElement('a');
  private source: EventSource | undefined;
  private generation = 0;
  private connected: { account: string; csrf: string; channel: string } | undefined;
  constructor(
    private auth: () => AuthStatus | undefined,
    private channels: () => readonly string[],
    private currentChannel: () => string,
    private readonlyView = false,
  ) {
    this.root.id = this.id;
    this.root.setAttribute('aria-label', 'Own message feedback');
    this.root.dataset.privateUserHolds = 'true';
    const h = document.createElement('h2');
    h.textContent = 'Private own-message feedback';
    const help = document.createElement('p');
    help.textContent =
      'Connect explicitly to see only your own held-message status for one channel. Requires user:read:chat. This read-only view sends EventSub subscription requests, never chat messages or moderation decisions. Feedback stays in memory, up to 100 rows / 15 minutes, and is cleared when you close, disconnect, change account/channel, enter privacy mode or lose the connection. Earlier events are unavailable. Approval here does not itself prove a public message was delivered.';
    const label = document.createElement('label');
    label.textContent = 'Feedback channel';
    this.channel.setAttribute('aria-label', 'Feedback channel');
    label.append(this.channel);
    this.consent.textContent = 'Grant own-message feedback permission';
    this.status.setAttribute('role', 'status');
    this.root.append(
      h,
      help,
      label,
      this.consent,
      this.button('Connect own-message feedback', () => this.connect()),
      this.button('Disconnect and clear feedback', () => this.disconnect('Disconnected; private feedback cleared')),
      this.list,
      this.status,
      this.button('Close own-message feedback', () => this.root.close()),
    );
    this.root.addEventListener('close', this.closed);
    this.channel.addEventListener('change', this.channelChanged);
    document.addEventListener('privacychange', this.privacy);
    document.body.append(this.root);
  }
  private button(text: string, action: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.addEventListener('click', () => {
      try {
        if (privacyEnabled()) throw new Error('Exit privacy mode first');
        action();
      } catch (error) {
        this.status.textContent = error instanceof Error ? error.message : 'Private feedback unavailable';
      }
    });
    return b;
  }
  private permission(): void {
    const auth = this.auth();
    this.consent.hidden = !auth?.enabled || !!auth.userFeedbackEnabled;
    if (auth?.loginURL) {
      const url = new URL(auth.loginURL);
      url.searchParams.set('feedback', 'read');
      url.searchParams.set('channel', this.channel.value);
      this.consent.href = url.href;
    }
    this.status.textContent = auth?.authenticated
      ? 'Actor ' +
        auth.login +
        ' · #' +
        this.channel.value +
        ' · ' +
        (auth.userFeedbackEnabled ? 'Ready to connect explicitly' : 'Grant user:read:chat first')
      : 'Log in to read your own message feedback';
  }
  open = (): void => {
    if (this.readonlyView) return;
    if (privacyEnabled()) return;
    this.disconnect();
    this.channel.replaceChildren();
    for (const name of this.channels()) {
      if (!/^[a-z0-9_]{1,25}$/.test(name)) continue;
      const option = document.createElement('option');
      option.value = name;
      option.textContent = '#' + name;
      this.channel.append(option);
    }
    if ([...this.channel.options].some((o) => o.value === this.currentChannel()))
      this.channel.value = this.currentChannel();
    this.permission();
    showPanel(this.root);
  };
  private connect(): void {
    const auth = this.auth(),
      channel = this.channel.value;
    if (
      !this.root.open ||
      !auth?.authenticated ||
      !auth.userFeedbackEnabled ||
      !auth.userID ||
      !auth.csrf ||
      !this.channels().includes(channel)
    )
      throw new Error('Choose a joined channel and grant user:read:chat first');
    this.disconnect();
    this.connected = { account: auth.userID, csrf: auth.csrf, channel };
    const account = auth.userID,
      generation = this.generation,
      source = (this.source = new EventSource('/api/auth/user-holds/events?' + new URLSearchParams({ channel })));
    this.status.textContent = 'Connecting private own-message feedback…';
    source.addEventListener('snapshot', (event) => {
      const current = this.auth();
      if (
        generation !== this.generation ||
        source !== this.source ||
        privacyEnabled() ||
        !this.root.open ||
        !current ||
        current.userID !== account ||
        current.csrf !== auth.csrf ||
        !current.userFeedbackEnabled ||
        !current.authenticated ||
        this.channel.value !== channel
      )
        return;
      try {
        if (!(event instanceof MessageEvent) || typeof event.data !== 'string' || event.data.length > 256 * 1024)
          throw new Error('Private feedback exceeds limit');
        const snapshot = parseUserHolds(JSON.parse(event.data), account, channel);
        this.list.replaceChildren();
        for (const row of snapshot.rows) {
          const p = document.createElement('p');
          p.textContent =
            new Date(row.at).toLocaleTimeString() +
            ' · ' +
            row.status +
            ' · ' +
            (row.text || 'Message body unavailable');
          this.list.append(p);
        }
        this.status.textContent = snapshot.detail;
        if (snapshot.state === 'unavailable') this.disconnect(snapshot.detail);
      } catch {
        this.disconnect('Private feedback invalid or changed; reconnect explicitly');
      }
    });
    source.onerror = () => {
      if (generation === this.generation && source === this.source)
        this.disconnect('Private connection ended; feedback cleared. Reconnect explicitly.');
    };
  }
  private disconnect(detail = ''): void {
    this.generation++;
    this.source?.close();
    this.source = undefined;
    this.connected = undefined;
    this.list.replaceChildren();
    this.status.textContent = detail;
  }
  authChanged(): void {
    const auth = this.auth();
    if (
      this.connected &&
      (!auth?.authenticated ||
        !auth.userFeedbackEnabled ||
        auth.userID !== this.connected.account ||
        auth.csrf !== this.connected.csrf)
    )
      this.disconnect('Account or permission changed; private feedback cleared');
  }
  private channelChanged = (): void => {
    this.disconnect();
    this.permission();
  };
  private closed = (): void => this.disconnect();
  private privacy = (): void => {
    if (privacyEnabled()) {
      this.disconnect();
      this.root.close();
    }
  };
  close(): void {
    this.root.close();
  }
  stop(): void {
    this.disconnect();
    this.root.removeEventListener('close', this.closed);
    this.channel.removeEventListener('change', this.channelChanged);
    document.removeEventListener('privacychange', this.privacy);
    this.root.remove();
  }
}
