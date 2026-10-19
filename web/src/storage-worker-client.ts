import { measureResourceWork } from './resource-timers';
import type { ArchiveRetention } from './archive-retention';
import type {
  ArchiveOperation,
  RetentionOperation,
  StorageOperation,
  StorageOperations,
  StorageReply,
} from './storage-worker-protocol';

const UNAVAILABLE =
  'Private journal worker unavailable; reload and check retained receipts before another action. No automatic retry.';
export class StorageWorkerClient {
  private worker: Worker | undefined;
  private failed: Error | undefined;
  private nextID = 0;
  private closing: Promise<void> | undefined;
  private pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      clean: () => void;
      policy?: (() => ArchiveRetention) | undefined;
      progress?: ((scanned: number) => void) | undefined;
    }
  >();
  constructor(
    create = () =>
      new Worker(new URL('./storage-worker.ts', import.meta.url), { type: 'module', name: 'chatty-cat-storage' }),
    private timeoutMs = 30000,
    private unavailable = UNAVAILABLE,
  ) {
    try {
      this.worker = create();
      this.worker.addEventListener('message', this.message);
      this.worker.addEventListener('error', this.failure);
      this.worker.addEventListener('messageerror', this.failure);
    } catch {
      this.fail();
    }
  }
  request<K extends StorageOperation>(
    operation: K,
    ...args: StorageOperations[K]['args']
  ): Promise<StorageOperations[K]['result']> {
    return this.enqueue(operation, args);
  }
  query<K extends ArchiveOperation>(
    operation: K,
    args: StorageOperations[K]['args'],
    options: { signal?: AbortSignal | undefined; progress?: ((scanned: number) => void) | undefined } = {},
  ): Promise<StorageOperations[K]['result']> {
    return this.enqueue(operation, args, options);
  }
  retention<K extends RetentionOperation>(
    operation: K,
    args: StorageOperations[K]['args'],
    policy: () => ArchiveRetention,
  ): Promise<StorageOperations[K]['result']> {
    return this.enqueue(operation, args, { policy });
  }
  private enqueue<K extends StorageOperation>(
    operation: K,
    args: StorageOperations[K]['args'],
    options: {
      policy?: (() => ArchiveRetention) | undefined;
      signal?: AbortSignal | undefined;
      progress?: ((scanned: number) => void) | undefined;
    } = {},
  ): Promise<StorageOperations[K]['result']> {
    if (options.signal?.aborted) return Promise.reject(new DOMException('Search cancelled', 'AbortError'));
    if (this.failed) return Promise.reject(this.failed);
    if (this.closing) return Promise.reject(new Error('Storage worker stopped; reload before another operation.'));
    if (operation !== 'stop' && this.pending.size >= 64)
      return Promise.reject(new Error('Storage worker busy; wait for pending operations.'));
    const id = ++this.nextID;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(), this.timeoutMs);
      const clean = () => {
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', abort);
      };
      const abort = () => {
        if (!this.pending.delete(id)) return;
        clean();
        try {
          this.worker?.postMessage({ version: 1, cancel: id });
        } catch {
          this.fail();
        }
        reject(new DOMException('Search cancelled', 'AbortError'));
      };
      this.pending.set(id, {
        resolve: (value) => resolve(value as StorageOperations[K]['result']),
        reject,
        clean,
        progress: options.progress,
        policy: options.policy,
      });
      options.signal?.addEventListener('abort', abort, { once: true });
      try {
        measureResourceWork('storage.dispatch.' + operation, () =>
          this.worker!.postMessage({ version: 1, id, operation, args }),
        );
      } catch {
        this.fail();
      }
    });
  }
  private message = (event: MessageEvent<unknown>): void => {
    measureResourceWork('storage.reply', () => this.receive(event));
  };
  private receive(event: MessageEvent<unknown>): void {
    const notice = event.data;
    if (
      notice &&
      typeof notice === 'object' &&
      'version' in notice &&
      notice.version === 1 &&
      'id' in notice &&
      Number.isSafeInteger(notice.id) &&
      'policy' in notice &&
      notice.policy === true
    ) {
      const pending = this.pending.get(Number(notice.id));
      if (!pending?.policy) {
        this.fail();
        return;
      }
      const policy = pending.policy;
      pending.policy = undefined; // At most one localStorage operation per admitted request.
      let reply: unknown;
      try {
        reply = { version: 1, policyReply: notice.id, ok: true, value: policy() };
      } catch (error) {
        reply = {
          version: 1,
          policyReply: notice.id,
          ok: false,
          error: {
            name: error instanceof Error || error instanceof DOMException ? error.name : 'Error',
            message:
              error instanceof Error || error instanceof DOMException ? error.message : 'Retention policy unavailable',
          },
        };
      }
      try {
        this.worker?.postMessage(reply);
      } catch {
        this.fail();
      }
      return;
    }
    if (
      notice &&
      typeof notice === 'object' &&
      'version' in notice &&
      notice.version === 1 &&
      'id' in notice &&
      Number.isSafeInteger(notice.id) &&
      'progress' in notice &&
      Number.isSafeInteger(notice.progress)
    ) {
      const pending = this.pending.get(Number(notice.id));
      try {
        pending?.progress?.(Number(notice.progress));
      } catch (error) {
        pending?.clean();
        this.pending.delete(Number(notice.id));
        try {
          this.worker?.postMessage({ version: 1, cancel: Number(notice.id) });
        } catch {
          this.fail();
        }
        pending?.reject(error instanceof Error ? error : new Error('Archive progress callback failed'));
      }
      return;
    }
    const reply = event.data as StorageReply | undefined;
    if (!reply || reply.version !== 1 || !Number.isSafeInteger(reply.id) || typeof reply.ok !== 'boolean') {
      this.fail();
      return;
    }
    const pending = this.pending.get(reply.id);
    if (!pending) return;
    this.pending.delete(reply.id);
    pending.clean();
    if (reply.ok) pending.resolve(reply.result);
    else if (reply.error && typeof reply.error.name === 'string' && typeof reply.error.message === 'string') {
      const error = new Error(reply.error.message);
      error.name = reply.error.name;
      pending.reject(error);
    } else {
      pending.reject(new Error(this.unavailable));
      this.fail();
    }
  }
  private failure = (): void => {
    this.fail();
  };
  private fail(): void {
    this.failed ??= Object.assign(new Error(this.unavailable), { name: 'StorageWorkerUnavailable' });
    for (const pending of this.pending.values()) {
      pending.clean();
      pending.reject(this.failed);
    }
    this.pending.clear();
    this.dispose();
  }
  private dispose(): void {
    this.worker?.removeEventListener('message', this.message);
    this.worker?.removeEventListener('error', this.failure);
    this.worker?.removeEventListener('messageerror', this.failure);
    this.worker?.terminate();
    this.worker = undefined;
  }
  stop(): Promise<void> {
    if (!this.closing) {
      const stop = this.failed ? Promise.resolve() : this.request('stop').then(() => {});
      this.closing = stop.finally(() => this.dispose());
    }
    return this.closing;
  }
}
