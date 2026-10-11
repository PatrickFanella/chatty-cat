import { MessageArchive } from './archive';
import type { ChatMessage } from './protocol';
export class ArchiveSearch {
  private controller: AbortController | undefined;
  private generation = 0;
  private input: HTMLInputElement;
  private channel: HTMLSelectElement;
  private results: HTMLElement;
  private status: HTMLElement;
  constructor(private dialog: HTMLDialogElement, private trigger: HTMLButtonElement, private archive: MessageArchive, channels: string[], private select: (message: ChatMessage) => void) {
    this.input = dialog.querySelector<HTMLInputElement>('#archive-query')!;
    this.channel = dialog.querySelector<HTMLSelectElement>('#archive-channel')!;
    this.results = dialog.querySelector<HTMLElement>('#archive-results')!;
    this.status = dialog.querySelector<HTMLElement>('#archive-status')!;
    for (const channel of channels) { const option = document.createElement('option'); option.value = channel; option.textContent = '#' + channel; this.channel.append(option); }
    trigger.addEventListener('click', this.open); dialog.querySelector('#archive-close')?.addEventListener('click', this.close);
    dialog.querySelector('form')?.addEventListener('submit', this.search); dialog.addEventListener('close', this.closed);
  }
  private open = (): void => { this.dialog.showModal(); this.input.focus(); };
  private close = (): void => this.dialog.close();
  private closed = (): void => { this.generation++; this.controller?.abort(); this.trigger.focus(); };
  private search = async (event: Event): Promise<void> => {
    event.preventDefault(); this.controller?.abort(); this.controller = new AbortController(); const generation = ++this.generation;
    this.status.textContent = 'Searching local archive…'; this.results.replaceChildren();
    try {
      const results = await this.archive.search({ text: this.input.value, ...(this.channel.value ? { channel: this.channel.value } : {}), limit: 100 }, this.controller.signal);
      if (generation !== this.generation) return;
      this.status.textContent = results.length === 100 ? 'Newest 100 matches; narrow your search for more' : `${results.length} local matches`;
      for (const message of results) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'archive-result';
        button.textContent = `${new Date(message.timestamp).toLocaleString()} · #${message.channel} · ${message.login}: ${message.text || message.tags['system-msg'] || ''}`;
        button.addEventListener('click', () => { this.select(message); this.dialog.close(); }); this.results.append(button);
      }
    } catch { if (generation === this.generation) this.status.textContent = 'Local archive search unavailable; live chat continues'; }
  };
  stop(): void { this.controller?.abort(); this.generation++; this.trigger.removeEventListener('click', this.open); this.dialog.querySelector('#archive-close')?.removeEventListener('click', this.close); this.dialog.querySelector('form')?.removeEventListener('submit', this.search); this.dialog.removeEventListener('close', this.closed); }
}
