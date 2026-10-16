import { JournalStore } from './moderation-journal-store';
import type { StorageReply, StorageRequest } from './storage-worker-protocol';

export class StorageWorkerHost {
  private journal = new JournalStore();
  private pending = new Set<Promise<unknown>>();
  private closing = false;
  private stopped: Promise<void> | undefined;
  async handle(raw: unknown): Promise<StorageReply | undefined> {
    if (!raw || typeof raw !== 'object' || !('id' in raw) || !Number.isSafeInteger(raw.id) || Number(raw.id) < 1)
      return;
    const id = Number(raw.id);
    try {
      if (!('version' in raw) || raw.version !== 1 || !('args' in raw) || !Array.isArray(raw.args))
        throw new Error('Invalid storage worker request');
      if (this.closing) throw new Error('Private journal stopped; reload before another action.');
      const request = raw as StorageRequest;
      if (request.operation === 'stop') {
        if (request.args.length) throw new Error('Invalid storage worker request');
        await this.stop();
        return { version: 1, id, ok: true, result: undefined };
      }
      const operation = this.execute(request);
      this.pending.add(operation);
      try {
        return { version: 1, id, ok: true, result: await operation };
      } finally {
        this.pending.delete(operation);
      }
    } catch (error) {
      return {
        version: 1,
        id,
        ok: false,
        error: {
          name: error instanceof Error || error instanceof DOMException ? error.name : 'Error',
          message:
            error instanceof Error || error instanceof DOMException
              ? error.message.slice(0, 600)
              : 'Storage operation failed',
        },
      };
    }
  }
  private async execute(request: StorageRequest): Promise<unknown> {
    const args = request.args;
    switch (request.operation) {
      case 'journal.list':
        if (args.length !== 1 || typeof args[0] !== 'string') break;
        return this.journal.list(request.args[0]);
      case 'journal.begin':
        if (args.length !== 2 || typeof args[0] !== 'string') break;
        return this.journal.begin(...request.args);
      case 'journal.finish':
        if (
          args.length !== 4 ||
          !args.every((value) => typeof value === 'string') ||
          !['confirmed', 'rejected', 'uncertain'].includes(request.args[2])
        )
          break;
        return this.journal.finish(...request.args);
      case 'journal.preview':
        if (args.length !== 2 || typeof args[0] !== 'string') break;
        return this.journal.preview(...request.args);
      case 'journal.apply':
        if (args.length !== 1) break;
        return this.journal.apply(request.args[0]);
    }
    throw new Error('Invalid storage worker operation or arguments');
  }
  stop(): Promise<void> {
    if (!this.stopped) {
      this.closing = true;
      this.stopped = Promise.allSettled([...this.pending]).then(() => this.journal.stop());
    }
    return this.stopped;
  }
}
