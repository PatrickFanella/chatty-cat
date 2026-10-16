import { ChatConnection } from './connection';
import type { AuthStatus } from './auth';
import type { ChatMessage } from './protocol';
export class WhisperRuntime extends EventTarget {
  identity = '';
  status = 'Log in with Twitch for whispers';
  unread = 0;
  visible = false;
  readonly messages: { message: ChatMessage; outgoing: boolean }[] = [];
  private paused = false;
  private enabled = false;
  private seen = new Set<string>();
  private connection: ChatConnection | undefined;
  constructor(
    private alert: (message: ChatMessage) => void,
    private observed: (message: ChatMessage, outgoing: boolean) => void = () => {},
  ) {
    super();
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
        this.messages.length = 0;
        this.visible = false;
        this.dispatchEvent(new Event('accountchange'));
      }
      this.identity = identity;
      this.enabled = enabled;
      this.status = identity
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
            else {
              this.status = event.detail || 'Incoming whispers ' + event.state;
              this.changed();
            }
          },
          '/api/auth/whispers',
        );
        if (this.paused) this.connection.disconnect();
        else this.connection.start();
      }
    }
    this.changed();
  }
  private changed(): void {
    this.dispatchEvent(new Event('change'));
    document.dispatchEvent(new Event('panelstatechange'));
  }
  echo(recipient: string, text: string, id: string): void {
    if (this.identity)
      this.append(
        { id, login: recipient, text, command: 'WHISPER', channel: '', timestamp: Date.now(), tags: {} },
        true,
      );
  }
  receive(message: ChatMessage): void {
    if (this.identity && message.command === 'WHISPER') this.append(message, false);
  }
  private append(message: ChatMessage, outgoing: boolean): void {
    const key = (outgoing ? 'out:' : 'in:') + message.id;
    if (message.id && this.seen.has(key)) return;
    if (message.id) this.seen.add(key);
    while (this.seen.size > 2000) this.seen.delete(this.seen.values().next().value!);
    this.observed(message, outgoing);
    this.messages.push({
      message: { ...message, tags: { 'display-name': message.tags['display-name'] ?? '' } },
      outgoing,
    });
    if (this.messages.length > 200) this.messages.shift();
    if (!outgoing && (!this.visible || document.hidden)) {
      this.unread++;
      this.alert(message);
    }
    this.changed();
  }
  setVisible(visible: boolean): void {
    this.visible = visible;
    if (visible) this.unread = 0;
    this.changed();
  }
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
    this.messages.length = 0;
    this.seen.clear();
  }
}
