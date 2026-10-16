import { ConversationInbox } from './inbox';
import type { ChatMessage } from './protocol';
export class InboxRuntime extends EventTarget {
  readonly model = new ConversationInbox();
  constructor() {
    super();
    window.addEventListener('storage', this.storage);
  }
  setAccount(id: string, login: string): boolean {
    const changed = this.model.setAccount(id, login);
    if (changed) {
      this.dispatchEvent(new Event('accountchange'));
      this.dispatchEvent(new Event('change'));
      document.dispatchEvent(new Event('panelstatechange'));
    }
    return changed;
  }
  observe(message: ChatMessage, forceMention = false): void {
    if (this.model.observe(message, forceMention)) this.dispatchEvent(new Event('change'));
    document.dispatchEvent(new Event('panelstatechange'));
  }
  whisper(message: ChatMessage, outgoing: boolean): void {
    this.model.whisper(message, outgoing);
    this.dispatchEvent(new Event('change'));
    document.dispatchEvent(new Event('panelstatechange'));
  }
  private storage = (event: StorageEvent): void => {
    if (event.key?.startsWith('chatthing:v1:inbox-read:')) {
      try {
        this.model.refreshReads();
        this.dispatchEvent(new Event('change'));
        document.dispatchEvent(new Event('panelstatechange'));
      } catch {
        /* Keep retained conversations when storage is unavailable. */
      }
    }
  };
  stop(): void {
    window.removeEventListener('storage', this.storage);
  }
}
