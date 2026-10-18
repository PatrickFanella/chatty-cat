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
    const retained = messages.slice();
    await this.client.request('summary.begin', { ...options, catalogs });
    for (let i = 0; i < retained.length; i += 2000)
      await this.client.request('summary.append', retained.slice(i, i + 2000));
    return this.client.request('summary.finish');
  }
  async stop(): Promise<void> {
    this.stopped = true;
    await this.client?.stop();
  }
}
