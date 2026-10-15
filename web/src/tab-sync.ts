import { parseEvent, type ChatMessage } from './protocol';
export class TabSync {
  private channel: BroadcastChannel | undefined;
  private account: string | undefined = 'anonymous';
  constructor(private receive: (message: ChatMessage) => void) {
    this.connect();
  }
  setAccount(account: string | undefined): void {
    if (account === this.account) return;
    this.stop();
    this.account = account;
    this.connect();
  }
  private connect(): void {
    try {
      if (this.account !== undefined && typeof BroadcastChannel !== 'undefined') {
        this.channel = new BroadcastChannel('chatthing:v1:sent:' + this.account);
        this.channel.addEventListener('message', this.message);
      }
    } catch {
      /* Optional cross-tab support. */
    }
  }
  private message = (event: MessageEvent<unknown>): void => {
    try {
      const raw = JSON.stringify(event.data);
      if (raw.length > 32768) return;
      const parsed = parseEvent(raw);
      if (
        parsed?.type !== 'message' ||
        parsed.message.command !== 'PRIVMSG' ||
        !parsed.message.id ||
        parsed.message.tags['local-echo'] !== '1'
      )
        return;
      this.receive(parsed.message);
    } catch {
      /* malformed cross-tab payload */
    }
  };
  send(message: ChatMessage): void {
    try {
      this.channel?.postMessage({ type: 'message', message, replay: false });
    } catch {
      /* optional cross-tab support */
    }
  }
  stop(): void {
    this.channel?.removeEventListener('message', this.message);
    this.channel?.close();
    this.channel = undefined;
  }
}
