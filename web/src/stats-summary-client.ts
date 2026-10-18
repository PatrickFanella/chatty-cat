import type { ChatMessage } from './protocol';
import type { Emote } from './tokens';
import type { StatisticsSummaryReport } from './stats-summary';
import { StorageWorkerClient } from './storage-worker-client';

export class StatisticsSummaryClient {
  private client: StorageWorkerClient | undefined;
  private stopped = false;
  async report(
    messages: readonly ChatMessage[],
    channels: readonly string[],
    emotes: (channel: string) => Record<string, Emote>,
    options: { now: number; windowMs: number; channel: string; excluded: string[]; header: boolean; panel: boolean },
  ): Promise<StatisticsSummaryReport> {
    if (this.stopped) throw new Error('Statistics panel stopped');
    if (messages.length > 100000 || channels.length > 24) throw new Error('Retained statistics capacity exceeded');
    const catalogs = Object.fromEntries(channels.map((channel) => [channel, emotes(channel)]));
    this.client ??= new StorageWorkerClient(
      undefined,
      undefined,
      'Retained statistics worker unavailable; reload to try again.',
    );
    return this.client.request('statistics.summarize', { ...options, messages, catalogs });
  }
  async stop(): Promise<void> {
    this.stopped = true;
    await this.client?.stop();
  }
}
