import { parseEvent, type ChatMessage } from './protocol';
export class TabSync {
  private channel: BroadcastChannel | undefined;
  constructor(private receive: (message: ChatMessage) => void) {
    try { if (typeof BroadcastChannel !== 'undefined') { this.channel = new BroadcastChannel('chatthing:v1:sent'); this.channel.addEventListener('message', this.message); } } catch { /* optional cross-tab support */ }
  }
  private message = (event: MessageEvent<unknown>): void => {
    try {
      const raw = JSON.stringify(event.data); if (raw.length > 32768) return;
      const parsed = parseEvent(raw); if (parsed?.type !== 'message' || parsed.message.command !== 'PRIVMSG' || !parsed.message.id || parsed.message.tags['local-echo'] !== '1') return;
      this.receive(parsed.message);
    } catch { /* malformed cross-tab payload */ }
  };
  send(message: ChatMessage): void { try { this.channel?.postMessage({ type: 'message', message, replay: false }); } catch { /* optional cross-tab support */ } }
  stop(): void { this.channel?.removeEventListener('message', this.message); this.channel?.close(); }
}
