import { profileKey } from './account-profiles';
import { ChatConnection } from './connection';
import { FloatingPanel } from './floating';
import type { AuthStatus } from './auth';
import type { ChatMessage } from './protocol';
import { appendLinks } from './links';
export class Whispers {
  private identity = '';
  private paused = false;
  private connection: ChatConnection | undefined;
  private enabled = false;
  private unread = 0;
  private seen = new Set<string>();
  private floating: FloatingPanel;
  private log: HTMLElement;
  private status: HTMLElement;
  constructor(
    private root: HTMLElement,
    private trigger: HTMLButtonElement,
    private answer: (login: string) => void,
    private alert: (message: ChatMessage) => void,
    private observed: (message: ChatMessage, outgoing: boolean) => void = () => {},
  ) {
    this.log = root.querySelector<HTMLElement>('#whisper-log')!;
    this.status = root.querySelector<HTMLElement>('#whisper-status')!;
    this.floating = new FloatingPanel(
      root,
      root.querySelector<HTMLElement>('#whisper-handle')!,
      root.querySelector<HTMLButtonElement>('#whisper-pin')!,
      profileKey('chatthing:v1:whispers:geometry'),
    );
    trigger.addEventListener('click', this.toggle);
    root.addEventListener('click', this.click);
    root.addEventListener('keydown', this.key);
    this.paint();
  }
  update(auth: AuthStatus | undefined): void {
    const identity = auth?.authenticated ? (auth.userID ?? '') : '';
    const enabled = !!identity && auth?.whispersEnabled === true;
    if (identity !== this.identity || enabled !== this.enabled) {
      this.connection?.stop();
      this.connection = undefined;
      if (identity !== this.identity) {
        this.unread = 0;
        this.seen.clear();
        this.log.replaceChildren();
        this.close();
      }
      this.identity = identity;
      this.enabled = enabled;
      this.status.textContent = identity
        ? enabled
          ? 'Connecting incoming whispers'
          : 'Log in again to enable whispers'
        : 'Log in with Twitch for whispers';
      if (enabled) {
        this.connection = new ChatConnection(
          [],
          (event) => {
            if (this.identity !== identity) return;
            if (event.type === 'message') this.receive(event.message);
            else this.status.textContent = event.detail || 'Incoming whispers ' + event.state;
          },
          '/api/auth/whispers',
        );
        if (this.paused) this.connection.disconnect();
        else this.connection.start();
      }
    }
    this.trigger.disabled = !identity;
    this.paint();
  }
  echo(recipient: string, text: string, id: string): void {
    if (!this.identity) return;
    this.append({ id, login: recipient, text, command: 'WHISPER', channel: '', timestamp: Date.now(), tags: {} }, true);
  }
  receive(message: ChatMessage): void {
    if (this.identity && message.command === 'WHISPER') this.append(message, false);
  }
  private append(message: ChatMessage, outgoing: boolean): void {
    const key = (outgoing ? 'out:' : 'in:') + message.id;
    if (message.id && this.seen.has(key)) return;
    if (message.id) this.seen.add(key);
    while (this.seen.size > 2000) {
      const first = this.seen.values().next().value;
      if (first) this.seen.delete(first);
      else break;
    }
    this.observed(message, outgoing);
    const row = document.createElement('article');
    row.className = 'whisper-row';
    const time = document.createElement('time');
    time.dateTime = new Date(message.timestamp).toISOString();
    time.textContent = new Date(message.timestamp).toLocaleTimeString();
    const name = document.createElement('button');
    name.type = 'button';
    name.dataset.answer = message.login;
    name.textContent = (outgoing ? 'Requested → ' : '← ') + (message.tags['display-name'] || message.login);
    const text = document.createElement('span');
    appendLinks(text, message.text);
    row.append(time, ' ', name, ' ', text);
    this.log.append(row);
    while (this.log.children.length > 200) this.log.firstElementChild?.remove();
    if (!outgoing && (this.root.hidden || document.hidden)) {
      this.unread++;
      this.alert(message);
    }
    if (!this.root.hidden) this.log.scrollTop = this.log.scrollHeight;
    this.paint();
  }
  private paint(): void {
    this.trigger.textContent = this.unread ? `Whispers (${this.unread})` : 'Whispers';
    this.trigger.setAttribute(
      'aria-label',
      this.unread ? `${this.unread} unread whispers. Open; Shift-click clears unread count.` : 'Open whispers',
    );
  }
  private open(): void {
    this.root.hidden = false;
    this.trigger.setAttribute('aria-expanded', 'true');
    this.unread = 0;
    this.paint();
    this.floating.opened();
    this.root.querySelector<HTMLElement>('#whisper-close')?.focus();
    this.log.scrollTop = this.log.scrollHeight;
  }
  private close(): void {
    this.root.hidden = true;
    this.trigger.setAttribute('aria-expanded', 'false');
    this.floating.closed();
  }
  private toggle = (event: MouseEvent): void => {
    if (event.shiftKey) {
      this.unread = 0;
      this.paint();
    } else if (this.root.hidden) this.open();
    else this.close();
  };
  private click = (event: MouseEvent): void => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>('button');
    if (button?.id === 'whisper-close') {
      this.close();
      this.trigger.focus();
    } else if (button?.dataset.answer && /^[a-z0-9_]{1,25}$/.test(button.dataset.answer))
      this.answer(button.dataset.answer);
  };
  private key = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      this.trigger.focus();
    }
  };
  disconnect(): void {
    this.paused = true;
    this.connection?.disconnect();
  }
  reconnect(): void {
    this.paused = false;
    this.connection?.reconnect();
  }
  stop(): void {
    this.connection?.stop();
    this.floating.stop();
    this.trigger.removeEventListener('click', this.toggle);
    this.root.removeEventListener('click', this.click);
    this.root.removeEventListener('keydown', this.key);
  }
}
