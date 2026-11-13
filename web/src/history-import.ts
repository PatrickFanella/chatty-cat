import { privacyEnabled } from './privacy';
import { parseEvent, type ChatMessage } from './protocol';

export interface HistoryImport {
  messages: ChatMessage[];
  skipped: number;
}
const limit = 10 * 1024 * 1024;
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function parseHistoryImport(raw: string): HistoryImport {
  if (raw.length > limit) throw new Error('History file exceeds 10 MB');
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('History file is not valid JSON');
  }
  if (!object(value) || value.format !== 'chatty-cat-history' || value.version !== 1 || !Array.isArray(value.messages))
    throw new Error('Unsupported history export');
  const rows: unknown[] = value.messages;
  if (rows.length > 10000) throw new Error('Import at most 10,000 rows per file');
  const messages: ChatMessage[] = [],
    seen = new Set<string>();
  let skipped = 0;
  for (const row of rows) {
    let message: ChatMessage | undefined;
    const event = parseEvent(JSON.stringify({ type: 'message', message: row, replay: true }));
    if (
      event?.type === 'message' &&
      ['PRIVMSG', 'USERNOTICE', 'NOTICE', 'CLEARCHAT', 'CLEARMSG'].includes(event.message.command) &&
      /^[a-z0-9_]{1,25}$/.test(event.message.channel) &&
      (!event.message.login || /^[a-z0-9_]{1,25}$/.test(event.message.login)) &&
      event.message.id.length <= 200 &&
      event.message.text.length <= 10000 &&
      Object.keys(event.message.tags).length <= 100 &&
      Object.values(event.message.tags).every((tag) => tag.length <= 2000)
    ) {
      const tags: Record<string, string> = { ...event.message.tags, 'imported-history': '1' };
      delete tags['local-echo'];
      delete tags['client-notice'];
      message = { ...event.message, tags };
    }
    if (!message) {
      skipped++;
      continue;
    }
    const key =
      message.channel +
      ':' +
      (message.id || [message.command, message.timestamp, message.login, message.text].join(':'));
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    messages.push(message);
  }
  messages.sort((a, b) => a.timestamp - b.timestamp);
  return { messages, skipped };
}

export class HistoryFiles {
  private input: HTMLInputElement;
  private status: HTMLElement;
  private button: HTMLButtonElement;
  private exportButton: HTMLButtonElement;
  private pending: HistoryImport | undefined;
  private generation = 0;
  constructor(
    root: HTMLElement,
    private messages: () => readonly ChatMessage[],
    private receive: (messages: readonly ChatMessage[]) => Promise<void>,
    private reviewedExport?: () => void,
  ) {
    this.input = root.querySelector<HTMLInputElement>('#history-file')!;
    this.status = root.querySelector<HTMLElement>('#history-status')!;
    this.button = root.querySelector<HTMLButtonElement>('#history-import')!;
    this.exportButton = root.querySelector<HTMLButtonElement>('#history-export')!;
    this.input.addEventListener('change', this.preview);
    this.button.addEventListener('click', this.import);
    this.exportButton.addEventListener('click', this.export);
  }
  private preview = async (): Promise<void> => {
    const generation = ++this.generation;
    this.pending = undefined;
    this.button.disabled = true;
    const file = this.input.files?.[0];
    if (!file) {
      this.status.textContent = '';
      return;
    }
    try {
      if (file.size > limit) throw new Error('History file exceeds 10 MB');
      const parsed = parseHistoryImport(await file.text());
      if (generation !== this.generation) return;
      this.pending = parsed;
      this.button.disabled = parsed.messages.length === 0;
      this.status.textContent = `${parsed.messages.length.toLocaleString()} ${parsed.messages.length === 1 ? 'message' : 'messages'} ready · ${parsed.skipped.toLocaleString()} invalid or duplicate rows skipped`;
    } catch (error) {
      if (generation === this.generation)
        this.status.textContent = error instanceof Error ? error.message : 'History could not be read';
    }
  };
  private import = async (): Promise<void> => {
    const pending = this.pending;
    if (!pending) return;
    this.button.disabled = true;
    this.input.disabled = true;
    try {
      await this.receive(pending.messages);
      this.pending = undefined;
      this.status.textContent = `${pending.messages.length.toLocaleString()} ${pending.messages.length === 1 ? 'message' : 'messages'} imported; existing history retained`;
    } catch {
      this.status.textContent = 'Import could not finish; existing history is retained. You can retry this file.';
      this.button.disabled = false;
    } finally {
      this.input.disabled = false;
    }
  };
  private export = (): void => {
    if (privacyEnabled()) {
      this.status.textContent = 'History export is disabled in privacy mode';
      return;
    }
    if (this.reviewedExport) {
      this.reviewedExport();
      return;
    }
    const blob = new Blob([JSON.stringify({ format: 'chatty-cat-history', version: 1, messages: this.messages() })], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob),
      link = document.createElement('a');
    link.href = url;
    link.download = 'chatty-cat-history-' + new Date().toISOString().slice(0, 10) + '.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  stop(): void {
    this.generation++;
    this.input.removeEventListener('change', this.preview);
    this.button.removeEventListener('click', this.import);
    this.exportButton.removeEventListener('click', this.export);
  }
}
