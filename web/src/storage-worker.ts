import { StorageWorkerHost } from './storage-worker-host';
import type { StorageReply } from './storage-worker-protocol';

// Dedicated worker entry. No window, localStorage, auth token or provider transport.
const port = self as unknown as {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(reply: StorageReply): void;
};
const host = new StorageWorkerHost();
port.onmessage = (event) => {
  void host.handle(event.data).then((reply) => {
    if (reply) port.postMessage(reply);
  });
};
