import type { StorageOperation, StorageOperations, StorageReply } from './storage-worker-protocol';

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
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  constructor(
    create = () =>
      new Worker(new URL('./storage-worker.ts', import.meta.url), { type: 'module', name: 'chatty-cat-storage' }),
    private timeoutMs = 30000,
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
    if (this.failed) return Promise.reject(this.failed);
    if (this.closing) return Promise.reject(new Error('Private journal stopped; reload before another action.'));
    if (operation !== 'stop' && this.pending.size >= 64)
      return Promise.reject(new Error('Private journal busy; wait for pending operations before another action.'));
    const id = ++this.nextID;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(), this.timeoutMs);
      this.pending.set(id, { resolve: (value) => resolve(value as StorageOperations[K]['result']), reject, timer });
      try {
        this.worker!.postMessage({ version: 1, id, operation, args });
      } catch {
        this.fail();
      }
    });
  }
  private message = (event: MessageEvent<unknown>): void => {
    const reply = event.data as StorageReply | undefined;
    if (!reply || reply.version !== 1 || !Number.isSafeInteger(reply.id) || typeof reply.ok !== 'boolean') {
      this.fail();
      return;
    }
    const pending = this.pending.get(reply.id);
    if (!pending) return;
    this.pending.delete(reply.id);
    clearTimeout(pending.timer);
    if (reply.ok) pending.resolve(reply.result);
    else if (reply.error && typeof reply.error.name === 'string' && typeof reply.error.message === 'string') {
      const error = new Error(reply.error.message);
      error.name = reply.error.name;
      pending.reject(error);
    } else {
      pending.reject(new Error(UNAVAILABLE));
      this.fail();
    }
  };
  private failure = (): void => {
    this.fail();
  };
  private fail(): void {
    this.failed ??= new Error(UNAVAILABLE);
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
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
