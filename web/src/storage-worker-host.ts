import { ArchiveStore } from './archive-store';
import { JournalStore } from './moderation-journal-store';
import type { StorageProgress, StorageReply, StorageRequest } from './storage-worker-protocol';

export class StorageWorkerHost {
  private journalStore: JournalStore | undefined;
  private get journal(): JournalStore {
    return (this.journalStore ??= new JournalStore());
  }
  private archive: ArchiveStore | undefined;
  private controllers = new Map<number, AbortController>();
  private pending = new Set<Promise<unknown>>();
  private closing = false;
  private stopped: Promise<void> | undefined;
  async handle(raw: unknown, progress: (value: StorageProgress) => void = () => {}): Promise<StorageReply | undefined> {
    if (
      raw &&
      typeof raw === 'object' &&
      'version' in raw &&
      raw.version === 1 &&
      'cancel' in raw &&
      Number.isSafeInteger(raw.cancel)
    ) {
      this.controllers.get(Number(raw.cancel))?.abort();
      return;
    }
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
      const controller = new AbortController();
      this.controllers.set(id, controller);
      const operation = this.execute(request, controller.signal, (scanned) =>
        progress({ version: 1, id, progress: scanned }),
      );
      this.pending.add(operation);
      try {
        return { version: 1, id, ok: true, result: await operation };
      } finally {
        this.pending.delete(operation);
        this.controllers.delete(id);
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
  private async execute(
    request: StorageRequest,
    signal: AbortSignal,
    progress: (scanned: number) => void,
  ): Promise<unknown> {
    const args = request.args;
    switch (request.operation) {
      case 'archive.append':
        return (this.archive ??= new ArchiveStore()).append(...request.args);
      case 'archive.recover':
        return (this.archive ??= new ArchiveStore()).recoverMissing(...request.args, signal);
      case 'archive.get':
        return (this.archive ??= new ArchiveStore()).get(...request.args);
      case 'archive.recent':
        return (this.archive ??= new ArchiveStore()).recent(...request.args, signal);
      case 'archive.search':
        return (this.archive ??= new ArchiveStore()).search(...request.args, signal);
      case 'archive.searchPage':
        return (this.archive ??= new ArchiveStore()).searchPage(...request.args, signal, progress);
      case 'archive.scanPage':
        return (this.archive ??= new ArchiveStore()).scanPage(
          request.args[0],
          request.args[1],
          request.args[2],
          signal,
        );
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
      this.stopped = Promise.allSettled([...this.pending]).then(async () => {
        await this.journalStore?.stop();
        await this.archive?.stop();
      });
    }
    return this.stopped;
  }
}
