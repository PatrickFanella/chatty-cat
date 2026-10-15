import type { Panel } from './shell/panels';
import type { AuthStatus } from './auth';
import {
  IRCClient,
  ircIdentity,
  ircQuery,
  parseIRCSnapshot,
  parseIRCMessage,
  type IRCAction,
  type IRCNetwork,
  type IRCSnapshot,
} from './irc-relay';
import { VirtualLog } from './virtual-log';
import { privacyEnabled } from './privacy';
export class IRCRelayPanel implements Panel {
  readonly id = 'irc-relay-panel';
  readonly title = 'IRC conversations';
  readonly group = 'tools';
  readonly root = document.createElement('dialog');
  private network = document.createElement('select');
  private target = document.createElement('input');
  private search = document.createElement('input');
  private draft = document.createElement('textarea');
  private status = document.createElement('p');
  private review = document.createElement('pre');
  private confirm = document.createElement('button');
  private log = document.createElement('section');
  private client: IRCClient;
  private virtual: VirtualLog;
  private networks: IRCNetwork[] = [];
  private snapshot: IRCSnapshot | undefined;
  private pending: { action: IRCAction; account: string; expires: number } | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;
  private revision = 0;
  private busy = false;
  private uncertain = '';
  constructor(
    private auth: () => AuthStatus | undefined,
    private readonlyView = false,
  ) {
    this.client = new IRCClient(auth);
    this.root.id = this.id;
    this.root.setAttribute('aria-label', 'Owner IRC conversations');
    const h = document.createElement('h2');
    h.textContent = 'Separate TLS IRC conversations';
    const help = document.createElement('p');
    help.textContent =
      'Only owner-configured networks and account-bound IRC nicknames are available. Connect/join and every send are reviewed explicitly. IRC identity is separate from Twitch scopes. Private records stay in this relay/account pane, never Twitch history, sync or extensions. Latest 500 records are temporary; disconnect/reconnect may retain bounded server memory, restart clears it. Submitted means socket write, not delivery. No automatic reconnect or resend. Close/privacy/page exit requests disconnect; a 30-second browser-lease timeout is the fallback.';
    this.network.setAttribute('aria-label', 'Configured IRC network');
    this.target.setAttribute('aria-label', 'IRC channel or private recipient');
    this.target.maxLength = 50;
    this.search.setAttribute('aria-label', 'IRC retained-record search');
    this.search.maxLength = 1000;
    this.search.placeholder = 'text, sender:, channel:, regex:, after:, before:';
    this.draft.setAttribute('aria-label', 'IRC message draft');
    this.draft.maxLength = 400;
    this.log.setAttribute('aria-label', 'IRC conversation pane');
    this.log.className = 'log';
    this.log.tabIndex = 0;
    this.log.style.cssText = 'height:320px;overflow:auto;min-width:320px;resize:both;white-space:pre-wrap';
    this.virtual = new VirtualLog(this.log, 'owner-irc');
    this.status.setAttribute('role', 'status');
    this.confirm = this.button('Confirm reviewed IRC action', () => this.commit());
    this.confirm.disabled = true;
    this.root.append(
      h,
      help,
      this.button('Load my configured IRC networks', async () => {
        this.networks = await this.client.networks();
        this.network.replaceChildren();
        for (const n of this.networks) {
          const o = document.createElement('option');
          o.value = n.id;
          o.textContent = n.name + ' / ' + n.nick;
          this.network.append(o);
        }
        this.network.value = this.network.options[0]?.value ?? '';
        this.status.textContent = this.networks.length
          ? 'Choose a network and review connecting.'
          : 'No network is configured for this account';
      }),
      this.network,
      this.button('Review connect/join configured channels', () => this.plan('connect')),
      this.button('Refresh IRC connection snapshot', async () => {
        this.snapshot = await this.client.read(this.network.value);
        this.poll();
      }),
      this.button('Review disconnect IRC network', () => this.plan('disconnect')),
      this.target,
      this.button('Review join approved channel', () => this.plan('join')),
      this.button('Review part approved channel', () => this.plan('part')),
      this.search,
      this.log,
      this.draft,
      this.button('Review IRC message', () => this.plan('send')),
      this.review,
      this.confirm,
      this.button('Close IRC and request disconnect', () => this.root.close()),
      this.status,
    );
    document.body.append(this.root);
    this.root.addEventListener('close', this.closed);
    this.network.addEventListener('change', this.networkChanged);
    this.target.addEventListener('input', this.edited);
    this.draft.addEventListener('input', this.edited);
    this.search.addEventListener('input', this.searchChanged);
    document.addEventListener('privacychange', this.privacy);
  }
  private button(text: string, action: () => void | Promise<void>): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.addEventListener('click', () => {
      if (this.busy) return;
      const generation = this.generation;
      try {
        if (privacyEnabled()) throw new Error('Exit privacy mode');
        this.busy = true;
        void Promise.resolve(action())
          .catch((e) => {
            if (generation === this.generation)
              this.status.textContent = e instanceof Error ? e.message : 'IRC action unavailable';
          })
          .finally(() => {
            if (generation === this.generation) this.busy = false;
          });
      } catch (e) {
        this.busy = false;
        this.status.textContent = e instanceof Error ? e.message : 'IRC unavailable';
      }
    });
    return b;
  }
  private plan(kind: IRCAction['kind']): void {
    if (this.uncertain && kind !== 'disconnect')
      throw new Error('Inspect the uncertain send or disconnect before reviewing another action');
    const a = this.auth(),
      n = this.networks.find((n) => n.id === this.network.value);
    if (!a?.authenticated || !a.userID || !n) throw new Error('Load and choose an authorized IRC network');
    if (kind !== 'connect' && (!this.snapshot || this.snapshot.network !== n.id))
      throw new Error('Connect this network first');
    const action: IRCAction = {
      kind,
      network: n.id,
      requestID: crypto.randomUUID(),
      ...(kind !== 'connect' ? { epoch: this.snapshot!.epoch } : {}),
      ...(kind === 'send' || kind === 'join' || kind === 'part' ? { target: this.target.value } : {}),
      ...(kind === 'send' ? { text: this.draft.value } : {}),
    };
    if (
      kind === 'send' &&
      (new TextEncoder().encode(this.draft.value).length > 400 ||
        !this.draft.value ||
        /[\r\n\x00\x01]/.test(this.draft.value))
    )
      throw new Error('Use 1–400 UTF-8 bytes without line/control framing');
    this.pending = { action, account: a.userID, expires: Date.now() + 60000 };
    this.review.textContent =
      kind +
      ' on ' +
      n.name +
      ' as IRC nick ' +
      n.nick +
      '; ' +
      (kind === 'connect'
        ? 'TLS registration and joins requested for ' + n.channels.join(', ')
        : 'connection ' + action.epoch + '; target ' + (action.target ?? 'network') + '\n' + (action.text ?? '')) +
      '. No Twitch action. Review expires in 60 seconds.';
    this.confirm.disabled = false;
  }
  private async commit(): Promise<void> {
    const p = this.pending;
    if (
      !p ||
      p.account !== this.auth()?.userID ||
      Date.now() > p.expires ||
      p.action.network !== this.network.value ||
      (p.action.kind !== 'connect' && p.action.epoch !== this.snapshot?.epoch)
    )
      throw new Error('IRC action review changed or expired');
    const generation = this.generation;
    this.confirm.disabled = true;
    if (p.action.kind === 'send') this.uncertain = p.action.requestID;
    let value: unknown;
    try {
      value = await this.client.action(p.action);
    } catch (error) {
      this.confirm.disabled = false;
      throw new Error(
        'IRC outcome may be uncertain. Retry only this same reviewed request, refresh the snapshot, or disconnect. ' +
          (error instanceof Error ? error.message : ''),
      );
    }
    if (generation !== this.generation) return;
    if (p.action.kind === 'connect') {
      this.snapshot = parseIRCSnapshot(value, p.action.network);
      this.target.value = this.snapshot.channels[0] ?? '';
      this.clearReview();
      this.poll();
    } else if (p.action.kind === 'send') {
      const receipt = parseIRCMessage(value);
      if (
        receipt.id !== p.action.epoch + ':' + p.action.requestID ||
        receipt.target !== p.action.target ||
        receipt.text !== p.action.text
      )
        throw new Error('IRC receipt changed; inspect before retry');
      this.clearReview();
      if (receipt.delivery !== 'uncertain') this.uncertain = '';
      if (receipt.delivery === 'uncertain')
        this.status.textContent = 'IRC write uncertain. Do not resend automatically; inspect and reconnect explicitly.';
      else {
        this.draft.value = '';
        this.status.textContent = 'IRC ' + receipt.delivery + '; not a Twitch message';
      }
    } else if (p.action.kind === 'disconnect') {
      this.clear();
      this.status.textContent = 'IRC disconnected';
    } else {
      this.clearReview();
      this.status.textContent = 'IRC channel action submitted; server acceptance is separate';
    }
  }
  private poll(): void {
    const id = this.snapshot?.network,
      generation = this.generation;
    if (!id) return;
    clearTimeout(this.timer);
    void this.client
      .read(id)
      .then((v) => {
        if (generation !== this.generation) return;
        if (this.snapshot && v.epoch !== this.snapshot.epoch)
          throw new Error('IRC connection epoch changed; review again');
        this.snapshot = v;
        if (this.uncertain) {
          const receipt = v.messages.find((m) => m.id === v.epoch + ':' + this.uncertain);
          if (receipt && (receipt.delivery === 'submitted' || receipt.delivery === 'observed')) {
            this.uncertain = '';
            this.clearReview();
          }
        }
        this.render();
        if (v.state === 'unavailable') {
          this.status.textContent = v.detail;
          return;
        }
        this.status.textContent = v.detail;
        this.timer = setTimeout(() => this.poll(), 2000);
      })
      .catch((e) => {
        if (generation === this.generation) {
          this.clearReview();
          this.status.textContent = e instanceof Error ? e.message : 'IRC connection ended';
        }
      });
  }
  private render(): void {
    let predicate: (m: IRCSnapshot['messages'][number]) => boolean;
    try {
      predicate = ircQuery(this.search.value);
    } catch (e) {
      this.status.textContent = e instanceof Error ? e.message : 'Invalid IRC query';
      return;
    }
    const messages =
      this.snapshot?.messages.filter(
        (m) => (!this.target.value || ircIdentity(m.target) === ircIdentity(this.target.value)) && predicate(m),
      ) ?? [];
    this.virtual.set(
      messages.map((m) => ({
        key: 'irc:' + this.snapshot!.network + ':' + m.id,
        text: m.text,
        render: () => {
          const row = document.createElement('div');
          row.className = 'row';
          row.textContent =
            new Date(m.time).toLocaleTimeString() +
            ' ' +
            m.target +
            ' <' +
            m.nick +
            '> ' +
            m.text +
            ' [' +
            m.delivery +
            ']';
          return row;
        },
      })),
      true,
      ++this.revision,
    );
  }
  private clearReview(): void {
    this.pending = undefined;
    this.review.textContent = '';
    this.confirm.disabled = true;
  }
  private clear(): void {
    if (this.snapshot) this.client.closeLease(this.snapshot.network, this.snapshot.epoch);
    this.generation++;
    this.busy = false;
    clearTimeout(this.timer);
    this.client.disconnect();
    this.snapshot = undefined;
    this.uncertain = '';
    this.clearReview();
    this.draft.value = '';
    this.search.value = '';
    this.virtual.set([], true, ++this.revision);
  }
  open = (): void => {
    if (this.readonlyView || privacyEnabled()) return;
    this.root.showModal();
  };
  private closed = (): void => this.clear();
  private edited = (): void => {
    this.clearReview();
    this.render();
  };
  private networkChanged = (): void => {
    this.clear();
    this.target.value = '';
  };
  private searchChanged = (): void => this.render();
  private privacy = (): void => {
    if (privacyEnabled()) {
      this.clear();
      this.networks = [];
      this.network.replaceChildren();
      this.target.value = '';
      this.root.close();
    }
  };
  authChanged(): void {
    if (this.client.authChanged()) {
      this.clear();
      this.networks = [];
      this.network.replaceChildren();
      this.target.value = '';
    }
  }
  close(): void {
    this.root.close();
  }
  stop(): void {
    this.clear();
    this.virtual.stop();
    this.root.removeEventListener('close', this.closed);
    this.network.removeEventListener('change', this.networkChanged);
    this.target.removeEventListener('input', this.edited);
    this.draft.removeEventListener('input', this.edited);
    this.search.removeEventListener('input', this.searchChanged);
    document.removeEventListener('privacychange', this.privacy);
    this.root.remove();
  }
}
