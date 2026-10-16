// In-process transport for tests: same worker host, asynchronous messages and
// structured clones in both directions. It never bypasses the RPC boundary.
import { beforeEach, vi } from 'vitest';
import { StorageWorkerHost } from '../src/storage-worker-host';
export class StorageWorkerShim extends EventTarget {
  readonly host = new StorageWorkerHost();
  terminated = false;
  postMessage(value: unknown): void {
    if (this.terminated) throw new Error('Worker terminated');
    const request = structuredClone(value);
    void Promise.resolve()
      .then(() =>
        this.host.handle(request, (progress) => {
          if (!this.terminated) this.dispatchEvent(new MessageEvent('message', { data: structuredClone(progress) }));
        }),
      )
      .then((reply) => {
        if (!this.terminated && reply)
          this.dispatchEvent(new MessageEvent('message', { data: structuredClone(reply) }));
      });
  }
  terminate(): void {
    this.terminated = true;
    void this.host.stop();
  }
}
beforeEach(() => vi.stubGlobal('Worker', StorageWorkerShim));
