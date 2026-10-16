import { StorageWorkerHost } from './storage-worker-host';
import type { StorageReply, StorageProgress } from './storage-worker-protocol';

// Dedicated worker entry. No window, localStorage, auth token or provider transport.
const port = self as unknown as {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(reply: StorageReply | StorageProgress): void;
};
const host = new StorageWorkerHost();
port.onmessage = (event) => {
  void host
    .handle(event.data, (progress) => port.postMessage(progress))
    .then((reply) => {
      if (reply) port.postMessage(reply);
    });
};
