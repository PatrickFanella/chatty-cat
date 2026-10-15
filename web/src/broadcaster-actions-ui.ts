import type { AuthStatus } from './auth';
import { ModerationJournal } from './moderation-journal';
import { privacyEnabled } from './privacy';
import {
  BROADCAST_ACTIONS,
  broadcasterCommand,
  parseBroadcastContext,
  parseBroadcastResult,
  type BroadcastAction,
  type BroadcastContext,
} from './broadcaster-actions';
export class BroadcasterPanel {
  readonly root = document.createElement('fieldset');
  private action = document.createElement('select');
  private text = document.createElement('input');
  private seconds = document.createElement('input');
  private category = document.createElement('select');
  private info = document.createElement('p');
  private preview = document.createElement('pre');
  private links = document.createElement('p');
  private status = document.createElement('p');
  private confirm: HTMLButtonElement;
  private auth: AuthStatus | undefined;
  private channel = '';
  private context: BroadcastContext | undefined;
  private reviewed: { action: BroadcastAction; command: string; context: BroadcastContext } | undefined;
  private generation = 0;
  private readSequence = 0;
  private controller: AbortController | undefined;
  private writeAbort: AbortController | undefined;
  private uncertain = false;
  busy = false;
  constructor(
    private journal: ModerationJournal,
    private guarded: () => boolean,
    private changed: () => Promise<void>,
  ) {
    this.root.dataset.privateBroadcast = 'true';
    const legend = document.createElement('legend');
    legend.textContent = 'Clip, marker and broadcaster actions';
    const help = document.createElement('p');
    help.textContent =
      'Account/channel stay explicit. Clip permission is decided by Twitch; published confirmation may take up to 60 seconds. Marker, title/category and commercial actions require the broadcaster account here; editor membership/writes are unavailable. Markers need live VOD-capable streams; commercials need a live affiliate/partner and provider cooldown. Metadata can change while offline. Search selects an exact category ID. Preview never writes; separate confirmation stores a private receipt and sends once. Uncertain outcomes require checking Twitch and refreshing before another action.';
    for (const key of Object.keys(BROADCAST_ACTIONS)) {
      const o = document.createElement('option');
      o.value = key;
      o.textContent = key;
      this.action.append(o);
    }
    this.action.setAttribute('aria-label', 'Broadcaster action');
    this.text.setAttribute('aria-label', 'Broadcaster title, marker description or category query');
    this.text.maxLength = 400;
    this.seconds.type = 'number';
    this.seconds.min = '30';
    this.seconds.max = '180';
    this.seconds.step = '30';
    this.seconds.value = '30';
    this.seconds.setAttribute('aria-label', 'Commercial duration seconds');
    this.category.setAttribute('aria-label', 'Exact category ID');
    this.category.append(this.option('Search and select a category', ''));
    this.confirm = this.button('Confirm reviewed broadcaster action', () => void this.send());
    this.confirm.disabled = true;
    this.status.setAttribute('role', 'status');
    this.root.append(
      legend,
      help,
      this.button('Grant clip/broadcaster/commercial consent', () => {
        if (!this.auth?.authenticated) throw new Error('Log in first');
        const u = new URL(this.auth.loginURL);
        u.searchParams.set('broadcast', 'manage');
        u.searchParams.set('account', this.auth.userID ?? '');
        u.searchParams.set('channel', this.channel);
        location.assign(u.href);
      }),
      this.action,
      this.text,
      this.seconds,
      this.category,
      this.button('Refresh broadcaster context / search category', () => void this.read()),
      this.info,
      this.button('Preview broadcaster action', () => this.stage()),
      this.preview,
      this.confirm,
      this.links,
      this.status,
    );
    this.action.onchange = () => {
      this.text.value = '';
      this.category.replaceChildren(this.option('Search and select a category', ''));
      this.clearReview();
    };
    for (const input of [this.text, this.seconds, this.category])
      input.addEventListener('input', () => {
        this.clearReview();
        if (input === this.text) this.category.replaceChildren(this.option('Search and select a category', ''));
      });
  }
  private button(text: string, action: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.onclick = () => {
      try {
        if (!this.guarded() || this.busy || privacyEnabled())
          throw new Error('Wait for the current action or exit privacy mode');
        action();
      } catch (e) {
        this.status.textContent = e instanceof Error ? e.message : 'Broadcaster action unavailable';
      }
    };
    return b;
  }
  private option(text: string, value: string): HTMLOptionElement {
    const option = document.createElement('option');
    option.textContent = text;
    option.value = value;
    return option;
  }
  private clearReview(): void {
    this.readSequence++;
    this.reviewed = undefined;
    this.preview.textContent = '';
    this.confirm.disabled = true;
  }
  setScope(auth: AuthStatus | undefined, channel: string): void {
    if (
      this.auth?.userID !== auth?.userID ||
      this.auth?.csrf !== auth?.csrf ||
      this.channel !== channel ||
      !auth?.authenticated
    ) {
      this.stop();
      this.text.value = '';
    }
    if (JSON.stringify(this.auth?.commandPermissions) !== JSON.stringify(auth?.commandPermissions)) this.clearReview();
    this.auth = auth;
    this.channel = channel;
  }
  private async read(): Promise<boolean> {
    const auth = this.auth;
    if (!auth?.authenticated || !auth.userID) {
      this.status.textContent = 'Log in for broadcaster context';
      return false;
    }
    this.controller?.abort();
    this.clearReview();
    const sequence = this.readSequence,
      generation = this.generation,
      channel = this.channel,
      controller = (this.controller = new AbortController());
    try {
      const params = new URLSearchParams({ channel });
      if (this.action.value === 'setgame' && this.text.value.trim()) params.set('category', this.text.value.trim());
      const res = await fetch('/api/auth/broadcaster-context?' + params, {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25000)]),
      });
      if (!res.ok)
        throw new Error('Broadcaster context unavailable (HTTP ' + res.status + '); check account/channel/provider');
      const value = parseBroadcastContext(await res.json(), auth.userID, channel);
      if (
        sequence !== this.readSequence ||
        generation !== this.generation ||
        controller.signal.aborted ||
        controller !== this.controller ||
        privacyEnabled()
      )
        return false;
      this.context = value;
      this.uncertain = false;
      this.category.replaceChildren(this.option('Select exact category ID', ''));
      for (const c of value.categories) this.category.append(this.option(c.name + ' / ID ' + c.id, c.id));
      this.info.textContent = `Actor ${auth.login} / ID ${value.account} · role ${value.role} · #${channel} / ID ${value.broadcasterID} · ${value.stream}${value.streamID ? ' / stream ' + value.streamID : ''} · ${value.broadcasterType || 'no affiliate/partner status'} · ${new Date(value.at).toISOString()} · title: ${value.title} · category: ${value.gameName || 'Unavailable'} / ID ${value.gameID || 'Unavailable'}. ${value.detail}`;
      this.status.textContent = 'Fresh provider context; choose and preview an action';
      return true;
    } catch (e) {
      if (generation !== this.generation || controller.signal.aborted) return false;
      this.context = undefined;
      this.info.textContent = '';
      this.status.textContent = e instanceof Error ? e.message : 'Provider context unavailable';
      return false;
    }
  }
  private permitted(context: BroadcastContext, action: BroadcastAction): void {
    if (this.uncertain) throw new Error('Check Twitch and refresh before another action; last outcome is uncertain');
    if (
      !this.auth?.authenticated ||
      context.account !== this.auth.userID ||
      context.channel !== this.channel ||
      !this.auth.commandPermissions?.includes(BROADCAST_ACTIONS[action])
    )
      throw new Error('Grant the required action scope and refresh context');
    if (action !== 'clip' && context.role !== 'broadcaster')
      throw new Error('Choose this channel’s broadcaster account; editor writes are unavailable');
    if (['clip', 'marker', 'commercial'].includes(action) && context.stream !== 'live')
      throw new Error('This action requires a verified live stream');
    if (action === 'commercial' && !['affiliate', 'partner'].includes(context.broadcasterType))
      throw new Error('Commercials require affiliate/partner eligibility and provider cooldown');
  }
  private stage(): void {
    const context = this.context,
      action = this.action.value as BroadcastAction;
    if (!context) throw new Error('Refresh provider context first');
    this.permitted(context, action);
    const command = broadcasterCommand(action, this.text.value.trim(), Number(this.seconds.value), this.category.value);
    if (action === 'setgame' && !context.categories.some((c) => c.id === this.category.value))
      throw new Error('Search and select the observed category ID');
    this.reviewed = { action, command, context };
    this.preview.textContent = `Review ${command}\nActor ${this.auth!.login} / ID ${context.account}\nChannel #${context.channel} / ID ${context.broadcasterID}\n${context.stream} / stream ${context.streamID || 'Unavailable'}; previous title ${context.title}; category ${context.gameName || 'Unavailable'} / ${context.gameID || 'Unavailable'}\nRequired scope ${BROADCAST_ACTIONS[action]}\n${action === 'commercial' ? 'Starts a commercial for channel viewers; actual served length may differ. ' : action === 'clip' ? 'Captures and publishes a clip; links appear only after published confirmation. ' : ''}Confirm rechecks identities and state, stores a private receipt and sends once. No automatic retry.`;
    this.confirm.disabled = false;
  }
  reviewCommand(text: string): void {
    const match = /^\/(clip|marker|settitle|setgame|commercial)(?:\s+(.*))?$/i.exec(text.trim());
    if (!match) throw new Error('Use a supported broadcaster command');
    if (this.busy || !this.guarded()) throw new Error('Wait for the current action');
    const action = match[1]!.toLowerCase() as BroadcastAction,
      value = match[2] ?? '';
    if (action === 'clip' && value) throw new Error('/clip takes no arguments');
    this.action.value = action;
    this.text.value = action === 'commercial' ? '' : value;
    this.seconds.value = action === 'commercial' ? value || '30' : '30';
    const generation = this.generation;
    void this.read().then((ok) => {
      if (!ok || generation !== this.generation || privacyEnabled()) return;
      try {
        if (action === 'setgame') {
          const matches = this.context!.categories.filter((c) =>
            value.startsWith('id:') ? c.id === value.slice(3) : c.name.toLowerCase() === value.toLowerCase(),
          );
          if (matches.length !== 1) throw new Error('Category unavailable or ambiguous; select an exact ID');
          this.category.value = matches[0]!.id;
        }
        this.stage();
      } catch (e) {
        this.status.textContent = e instanceof Error ? e.message : 'Action preview unavailable';
      }
    });
  }
  private async send(): Promise<void> {
    const review = this.reviewed,
      auth = this.auth;
    if (!review || !auth?.userID || !auth.csrf) return;
    const generation = this.generation,
      account = auth.userID,
      id = crypto.randomUUID(),
      abort = (this.writeAbort = new AbortController());
    this.busy = true;
    this.controller?.abort();
    this.confirm.disabled = true;
    this.status.textContent =
      review.action === 'clip'
        ? 'Sending once; waiting up to 60 seconds for published clip confirmation…'
        : 'Sending reviewed action once…';
    let saved = false,
      started = false;
    try {
      this.permitted(review.context, review.action);
      await this.journal.begin(account, {
        id,
        at: Date.now(),
        channel: review.context.channel,
        target: review.action,
        broadcasterID: review.context.broadcasterID,
        command: review.command,
        outcome: 'pending',
        detail: '',
      });
      saved = true;
      if (generation !== this.generation || privacyEnabled()) throw new Error('Account or view changed');
      started = true;
      const res = await fetch('/api/chat/send', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': auth.csrf },
        body: JSON.stringify({
          channel: review.context.channel,
          message: review.command,
          requestID: id,
          expectedBroadcasterID: review.context.broadcasterID,
          expectedStreamID: review.context.streamID,
          expectedBroadcastRevision: review.context.revision,
        }),
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(75000)]),
      });
      const value = parseBroadcastResult(await res.json()),
        confirmed =
          res.ok &&
          value.result.sent &&
          value.result.command &&
          (review.action !== 'clip' || (!!value.resourceID && !!value.url)) &&
          (review.action !== 'marker' || !!value.resourceID);
      const outcome = confirmed ? 'confirmed' : value.result.sent || value.result.uncertain ? 'uncertain' : 'rejected';
      await this.journal.finish(
        account,
        id,
        outcome,
        confirmed
          ? value.detail || 'Provider confirmed broadcaster action'
          : (value.result.error ?? 'Broadcaster result unavailable'),
      );
      if (generation === this.generation && !privacyEnabled()) {
        this.uncertain = outcome === 'uncertain';
        this.clearReview();
        this.links.replaceChildren();
        if (confirmed && value.url) {
          for (const [label, url] of [
            ['Open confirmed clip', value.url],
            ['Edit confirmed clip', value.editURL],
          ])
            if (url) {
              const a = document.createElement('a');
              a.href = url!;
              a.textContent = label!;
              a.target = '_blank';
              a.rel = 'noopener noreferrer';
              this.links.append(a, ' ');
            }
        }
        this.status.textContent = confirmed
          ? value.detail || 'Provider confirmed broadcaster action'
          : outcome === 'uncertain'
            ? 'Outcome uncertain; check Twitch and refresh. No automatic retry'
            : (value.result.error ?? 'Broadcaster action rejected');
        await this.changed();
      }
    } catch (e) {
      if (saved)
        try {
          await this.journal.finish(
            account,
            id,
            started ? 'uncertain' : 'rejected',
            started ? 'Broadcaster request outcome unavailable; check Twitch' : 'No broadcaster request was sent',
          );
        } catch {
          /* Pending receipt remains unconfirmed. */
        }
      if (generation === this.generation && !privacyEnabled()) {
        this.uncertain = started;
        this.clearReview();
        this.links.replaceChildren();
        this.status.textContent =
          (started ? 'Outcome uncertain; check Twitch. No automatic retry. ' : 'No provider request was sent. ') +
          (e instanceof Error ? e.message : 'Action unavailable');
      }
    } finally {
      if (generation === this.generation) this.busy = false;
    }
  }
  stop(): void {
    this.text.value = '';
    this.category.replaceChildren(this.option('Search and select a category', ''));
    this.generation++;
    this.controller?.abort();
    this.writeAbort?.abort();
    this.busy = false;
    this.uncertain = false;
    this.context = undefined;
    this.clearReview();
    this.info.textContent = '';
    this.status.textContent = '';
    this.links.replaceChildren();
  }
}
