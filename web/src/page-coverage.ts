import { ownedInterval, clearOwnedInterval } from './resource-timers';
import type { ChatMessage } from './protocol';

// Observation timestamps are separate from message timestamps: quiet chat does
// not imply the page was closed, and replay is not proof of live observation.
export class PageCoverage {
  private timer: ReturnType<typeof setInterval>;
  constructor(
    private channels: readonly string[],
    private add: (message: ChatMessage) => void,
    now = Date.now(),
  ) {
    const initial = [...channels];
    this.channels = [];
    this.setChannels(initial, now);
    this.timer = ownedInterval('storage.coverage', () => this.save(), 10000);
  }
  setChannels(channels: readonly string[], now = Date.now()): void {
    this.save(now);
    const previous = new Set(this.channels);
    this.channels = [...new Set(channels)];
    for (const channel of this.channels.filter((channel) => !previous.has(channel))) {
      let raw: string | null = null;
      try {
        raw = localStorage.getItem(this.key(channel));
      } catch {
        /* optional storage */
      }
      const last = raw === null ? NaN : Number(raw);
      if (raw !== null && /^\d+$/.test(raw) && Number.isSafeInteger(last) && last > 0 && now - last > 30000) {
        this.add({
          id: 'gap-' + crypto.randomUUID(),
          command: 'NOTICE',
          channel,
          login: '',
          timestamp: now,
          text: 'Page observation resumed; messages may be missing while this page was closed or inactive',
          tags: {
            'client-notice': '1',
            'msg-id': 'gap',
            'gap-state': 'end',
            'gap-start': String(last),
            'gap-kind': 'page',
          },
        });
      }
    }
    this.save(now);
  }
  private key(channel: string): string {
    return 'chatthing:v1:observed:' + channel;
  }
  private save(now = Date.now()): void {
    for (const channel of this.channels) {
      try {
        localStorage.setItem(this.key(channel), String(now));
      } catch {
        /* optional storage */
      }
    }
  }
  stop(): void {
    clearOwnedInterval(this.timer);
    this.save();
  }
}
