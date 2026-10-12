import type { ChatMessage } from './protocol';

// Observation timestamps are separate from message timestamps: quiet chat does
// not imply the page was closed, and replay is not proof of live observation.
export class PageCoverage {
  private timer: ReturnType<typeof setInterval>;
  constructor(private channels: readonly string[], add: (message: ChatMessage) => void, now = Date.now()) {
    for (const channel of channels) {
      let raw: string | null = null;
      try { raw = localStorage.getItem(this.key(channel)); } catch { /* optional storage */ }
      const last = raw === null ? NaN : Number(raw);
      if (raw !== null && /^\d+$/.test(raw) && Number.isSafeInteger(last) && last > 0 && now - last > 30000) {
        add({ id: 'gap-' + crypto.randomUUID(), command: 'NOTICE', channel, login: '', timestamp: now,
          text: 'Page observation resumed; messages may be missing while this page was closed or inactive',
          tags: { 'client-notice': '1', 'msg-id': 'gap', 'gap-state': 'end', 'gap-start': String(last), 'gap-kind': 'page' } });
      }
    }
    this.save(now);
    this.timer = setInterval(() => this.save(), 10000);
  }
  private key(channel: string): string { return 'chatthing:v1:observed:' + channel; }
  private save(now = Date.now()): void {
    for (const channel of this.channels) {
      try { localStorage.setItem(this.key(channel), String(now)); } catch { /* optional storage */ }
    }
  }
  stop(): void { clearInterval(this.timer); this.save(); }
}
