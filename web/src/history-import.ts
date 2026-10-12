import { privacyEnabled } from './privacy';
import { parseEvent, type ChatMessage } from './protocol';

export interface HistoryImport { messages: ChatMessage[]; skipped: number }
const limit = 10 * 1024 * 1024;
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function readable(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (!(node instanceof Element)) return '';
  if (node.matches('script,style,iframe,video,audio,button,.rplybtn,.twprev,.ytprev')) return '';
  if (node instanceof HTMLImageElement) return node.classList.contains('emote') ? node.alt : '';
  if (node instanceof HTMLAnchorElement) {
    try { const url = new URL(node.getAttribute('href') ?? ''); if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) return url.href; } catch { /* retain the readable label */ }
  }
  if (node.tagName === 'BR') return '\n';
  return [...node.childNodes].map(readable).join('');
}
function legacy(raw: string, defaultChannel: string): ChatMessage | undefined {
  if (raw.length > 65536) return;
  // Template contents stay inert and are never inserted into the live document.
  const template = document.createElement('template'); template.innerHTML = raw;
  const row = template.content.querySelector<HTMLElement>('.row');
  if (!row || template.content.querySelectorAll('.row').length !== 1) return;
  const timestamp = Number(row.dataset.ts), channel = (row.dataset.ch || defaultChannel).replace(/^#/, '').toLowerCase();
  const login = (row.dataset.u ?? '').toLowerCase();
  if (!row.dataset.ts || !Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp > 8640000000000000 || !/^[a-z0-9_]{1,25}$/.test(channel) || (login && !/^[a-z0-9_]{1,25}$/.test(login))) return;
  const body = row.querySelector('.msg');
  let text = body ? readable(body) : '';
  text = text.replace(/[\t\r ]+/g, ' ').trim();
  const tags: Record<string, string> = { 'imported-history': '1' };
  const name = row.querySelector('.name'); if (name?.textContent) tags['display-name'] = name.textContent.slice(0, 100);
  const quote = row.querySelector<HTMLElement>('.reply[data-pid]');
  if (quote?.dataset.pid) {
    tags['reply-parent-msg-id'] = quote.dataset.pid.slice(0, 200);
    tags['reply-parent-display-name'] = quote.querySelector('b')?.textContent?.slice(0, 100) ?? '';
    tags['reply-parent-msg-body'] = quote.querySelector('i')?.textContent?.slice(0, 1000) ?? '';
  }
  let command = 'PRIVMSG';
  if (row.classList.contains('notice') || !login) {
    command = 'NOTICE';
    if (!text) { for (const item of row.querySelectorAll('.time,.chtag,.name,.aux,.auxr,.role')) item.remove(); text = readable(row).trim(); }
  }
  if (row.classList.contains('action')) text = '\x01ACTION ' + text + '\x01';
  return { id: (row.dataset.mid ?? '').slice(0, 200), command, channel, login, text: text.slice(0, 10000), timestamp, tags };
}
export function parseHistoryImport(raw: string, defaultChannel: string): HistoryImport {
  if (raw.length > limit) throw new Error('History file exceeds 10 MB');
  let value: unknown; try { value = JSON.parse(raw); } catch { throw new Error('History file is not valid JSON'); }
  let rows: unknown[];
  if (Array.isArray(value)) rows = value;
  else if (object(value) && value.format === 'chatty-cat-history' && value.version === 1 && Array.isArray(value.messages)) rows = value.messages;
  else if (object(value)) {
    rows = [];
    for (const [key, entry] of Object.entries(value)) if (/^hasan-history(?:-[a-z0-9_]{1,25})?$/.test(key)) {
      let parsed: unknown = entry; if (typeof entry === 'string') { try { parsed = JSON.parse(entry); } catch { continue; } }
      if (Array.isArray(parsed)) { if (parsed.length > 10000) throw new Error('Import at most 10,000 rows per file'); const channel = key === 'hasan-history' ? 'hasanabi' : key.slice('hasan-history-'.length); rows.push(...parsed.map(row => typeof row === 'string' ? { html: row, ch: channel } : row)); }
    }
    if (!rows.length) throw new Error('Unsupported history export');
  } else throw new Error('Unsupported history export');
  if (rows.length > 10000) throw new Error('Import at most 10,000 rows per file');
  const messages: ChatMessage[] = [], seen = new Set<string>(); let skipped = 0;
  for (const row of rows) {
    let message: ChatMessage | undefined;
    if (typeof row === 'string') message = legacy(row, defaultChannel);
    else if (object(row) && typeof row.html === 'string') message = legacy(row.html, typeof row.ch === 'string' && /^[a-z0-9_]{1,25}$/.test(row.ch) ? row.ch : defaultChannel);
    else {
      const event = parseEvent(JSON.stringify({ type: 'message', message: row, replay: true }));
      if (event?.type === 'message' && ['PRIVMSG', 'USERNOTICE', 'NOTICE', 'CLEARCHAT', 'CLEARMSG'].includes(event.message.command) && /^[a-z0-9_]{1,25}$/.test(event.message.channel) && (!event.message.login || /^[a-z0-9_]{1,25}$/.test(event.message.login)) && event.message.id.length <= 200 && event.message.text.length <= 10000 && Object.keys(event.message.tags).length <= 100 && Object.values(event.message.tags).every(tag => tag.length <= 2000)) {
        const tags: Record<string, string> = { ...event.message.tags, 'imported-history': '1' }; delete tags['local-echo']; delete tags['client-notice'];
        message = { ...event.message, tags };
      }
    }
    if (!message) { skipped++; continue; }
    const key = message.channel + ':' + (message.id || [message.command, message.timestamp, message.login, message.text].join(':'));
    if (seen.has(key)) { skipped++; continue; } seen.add(key); messages.push(message);
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
  constructor(root: HTMLElement, private channel: () => string, private messages: () => readonly ChatMessage[], private receive: (messages: readonly ChatMessage[]) => Promise<void>) {
    this.input = root.querySelector<HTMLInputElement>('#history-file')!; this.status = root.querySelector<HTMLElement>('#history-status')!;
    this.button = root.querySelector<HTMLButtonElement>('#history-import')!; this.exportButton = root.querySelector<HTMLButtonElement>('#history-export')!;
    this.input.addEventListener('change', this.preview); this.button.addEventListener('click', this.import); this.exportButton.addEventListener('click', this.export);
  }
  private preview = async (): Promise<void> => {
    const generation = ++this.generation; this.pending = undefined; this.button.disabled = true;
    const file = this.input.files?.[0]; if (!file) { this.status.textContent = ''; return; }
    try {
      if (file.size > limit) throw new Error('History file exceeds 10 MB');
      const parsed = parseHistoryImport(await file.text(), this.channel()); if (generation !== this.generation) return;
      this.pending = parsed; this.button.disabled = parsed.messages.length === 0;
      this.status.textContent = `${parsed.messages.length.toLocaleString()} ${parsed.messages.length === 1 ? 'message' : 'messages'} ready · ${parsed.skipped.toLocaleString()} invalid or duplicate rows skipped`;
    } catch (error) { if (generation === this.generation) this.status.textContent = error instanceof Error ? error.message : 'History could not be read'; }
  };
  private import = async (): Promise<void> => {
    const pending = this.pending; if (!pending) return; this.button.disabled = true; this.input.disabled = true;
    try { await this.receive(pending.messages); this.pending = undefined; this.status.textContent = `${pending.messages.length.toLocaleString()} ${pending.messages.length === 1 ? 'message' : 'messages'} imported; existing history retained`; }
    catch { this.status.textContent = 'Import could not finish; existing history is retained. You can retry this file.'; this.button.disabled = false; }
    finally { this.input.disabled = false; }
  };
  private export = (): void => {
    if(privacyEnabled()){this.status.textContent='History export is disabled in privacy mode';return;}
    const blob = new Blob([JSON.stringify({ format: 'chatty-cat-history', version: 1, messages: this.messages() })], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = 'chatty-cat-history-' + new Date().toISOString().slice(0, 10) + '.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  stop(): void { this.generation++; this.input.removeEventListener('change', this.preview); this.button.removeEventListener('click', this.import); this.exportButton.removeEventListener('click', this.export); }
}
