import type { AuthStatus } from './auth';
import { getProfileScope } from './account-profiles';
import { privacyEnabled } from './privacy';
import { parseDeviceDocument, type DeviceDocument } from './device-sync';
export interface DeviceSnapshot {
  revision: string;
  updated: number;
  document: DeviceDocument | null;
}
export type DeviceMutation = { kind: 'publish'; document: DeviceDocument } | { kind: 'delete' };
export class DeviceConflict extends Error {
  constructor() {
    super('Sync revision changed. Fetch the current snapshot and review again.');
  }
}
function record(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
export function parseDeviceSnapshot(v: unknown): DeviceSnapshot {
  if (
    !record(v) ||
    typeof v.revision !== 'string' ||
    !/^(?:0|[a-f0-9]{32})$/.test(v.revision) ||
    typeof v.updated !== 'number' ||
    !Number.isSafeInteger(v.updated) ||
    v.updated < 0 ||
    v.updated > Date.now() + 300000 ||
    (v.revision === '0' && (v.updated !== 0 || v.document !== null)) ||
    (v.revision !== '0' && v.updated < 1)
  )
    throw new Error('Invalid account sync snapshot');
  return {
    revision: v.revision,
    updated: v.updated,
    document: v.document === null ? null : parseDeviceDocument(v.document),
  };
}
async function read(response: Response, limit = 2 * 1024 * 1024 + 4096): Promise<unknown> {
  if (!response.ok) throw new Error('Sync unavailable (HTTP ' + response.status + '); no automatic retry');
  if (Number(response.headers.get('content-length') ?? 0) > limit) throw new Error('Sync response exceeds limit');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Sync response missing');
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw new Error('Sync response exceeds limit');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('Invalid sync response');
  }
}
export class DeviceSyncClient {
  private abort = new AbortController();
  private generation = 0;
  private scope: { account: string; csrf: string } | undefined;
  private snapshot: DeviceSnapshot | undefined;
  constructor(private auth: () => AuthStatus | undefined) {}
  private context(): { account: string; csrf: string } {
    const auth = this.auth();
    if (privacyEnabled() || !auth?.authenticated || !auth.userID || !auth.csrf || getProfileScope() !== auth.userID)
      throw new Error('Choose the current signed-in account outside privacy mode');
    return { account: auth.userID, csrf: auth.csrf };
  }
  private valid(context: { account: string; csrf: string }, generation: number): void {
    const now = this.context();
    if (generation !== this.generation || now.account !== context.account || now.csrf !== context.csrf)
      throw new Error('Sync account/session changed; reconnect');
  }
  async connect(): Promise<DeviceSnapshot> {
    this.disconnect();
    const context = this.context(),
      generation = this.generation;
    this.scope = context;
    const signal = AbortSignal.any([this.abort.signal, AbortSignal.timeout(15000)]);
    const config = await read(
      await fetch('/api/sync/config', { credentials: 'same-origin', cache: 'no-store', signal }),
      2048,
    );
    this.valid(context, generation);
    if (!record(config) || config.enabled !== true || config.maxBytes !== 2 * 1024 * 1024)
      throw new Error('Device sync is not configured on this server');
    const snapshot = parseDeviceSnapshot(
      await read(
        await fetch('/api/sync', {
          credentials: 'same-origin',
          cache: 'no-store',
          signal,
          headers: { 'X-Account-ID': context.account },
        }),
      ),
    );
    this.valid(context, generation);
    this.snapshot = snapshot;
    return snapshot;
  }
  async mutate(mutation: DeviceMutation, revision: string, requestID: string): Promise<DeviceSnapshot> {
    const context = this.context();
    if (
      !this.scope ||
      this.scope.account !== context.account ||
      this.scope.csrf !== context.csrf ||
      !this.snapshot ||
      this.snapshot.revision !== revision
    )
      throw new Error('Fetch and review this account revision before writing');
    const generation = this.generation,
      signal = AbortSignal.any([this.abort.signal, AbortSignal.timeout(30000)]);
    const body = JSON.stringify(
      mutation.kind === 'delete' ? { requestID } : { requestID, document: parseDeviceDocument(mutation.document) },
    );
    const response = await fetch('/api/sync', {
      method: mutation.kind === 'delete' ? 'DELETE' : 'PUT',
      credentials: 'same-origin',
      cache: 'no-store',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Account-ID': context.account,
        'X-CSRF-Token': context.csrf,
        'If-Match': '"' + revision + '"',
      },
      body,
    });
    this.valid(context, generation);
    if (response.status === 409) {
      this.snapshot = undefined;
      throw new DeviceConflict();
    }
    const result = parseDeviceSnapshot(await read(response));
    this.valid(context, generation);
    this.snapshot = result;
    return result;
  }
  async verify(revision: string): Promise<void> {
    const context = this.context();
    if (!this.scope || this.scope.account !== context.account || this.scope.csrf !== context.csrf)
      throw new Error('Reconnect this account first');
    const generation = this.generation,
      signal = AbortSignal.any([this.abort.signal, AbortSignal.timeout(15000)]);
    const current = parseDeviceSnapshot(
      await read(
        await fetch('/api/sync', {
          credentials: 'same-origin',
          cache: 'no-store',
          signal,
          headers: { 'X-Account-ID': context.account },
        }),
      ),
    );
    this.valid(context, generation);
    if (current.revision !== revision) {
      this.snapshot = undefined;
      throw new DeviceConflict();
    }
  }
  disconnect(): void {
    this.generation++;
    this.abort.abort();
    this.abort = new AbortController();
    this.scope = undefined;
    this.snapshot = undefined;
  }
}
