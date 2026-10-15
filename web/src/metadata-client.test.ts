import { afterEach, expect, it, vi } from 'vitest';
import { MetadataClient } from './metadata';
let client: MetadataClient | undefined;
afterEach(() => {
  client?.stop();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it('bounds metadata fetch concurrency and cancels removed sources without accepting stale responses', async () => {
  const pending: { url: string; signal: AbortSignal; resolve: (value: unknown) => void }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (url: string, init: RequestInit) =>
        new Promise((resolve) => pending.push({ url, signal: init.signal!, resolve })),
    ),
  );
  const receive = vi.fn(),
    failure = vi.fn();
  client = new MetadataClient(
    Array.from({ length: 12 }, (_, i) => 'room' + i),
    receive,
    failure,
  );
  client.start();
  expect(pending).toHaveLength(4);
  client.setChannels(['new']);
  expect(pending).toHaveLength(5);
  expect(pending.slice(0, 4).every((p) => p.signal.aborted)).toBe(true);
  const data = (channel: string) =>
    new Response(
      JSON.stringify({ channel, errors: [], emotes: {}, badges: {}, stream: { uptime: '', viewers: '', title: '' } }),
    );
  for (const p of pending.slice(0, 4)) p.resolve(data(p.url.split('/').at(-1)!));
  pending[4]!.resolve(data('new'));
  await vi.waitFor(() => expect(receive).toHaveBeenCalledOnce());
  expect(receive.mock.calls[0]?.[0].channel).toBe('new');
  expect(failure).not.toHaveBeenCalled();
});

it('coalesces provider hints through the refresh cooldown and retains hints arriving during a read', async () => {
  vi.useFakeTimers();
  const pending: { url: string; resolve: (r: Response) => void }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => new Promise<Response>((resolve) => pending.push({ url, resolve }))),
  );
  client = new MetadataClient(['room'], vi.fn(), vi.fn());
  client.start();
  client.requestProviderRefresh('7TV', 'room');
  expect(pending.at(-1)?.url).toBe('/api/channels/room?refresh=7TV');
  client.requestProviderRefresh('BTTV', 'room');
  client.requestProviderRefresh('7TV', 'room');
  client.requestProviderRefresh('7TV', 'notjoined');
  const response = () =>
    new Response(
      JSON.stringify({
        channel: 'room',
        emotes: {},
        badges: {},
        stream: { title: '', uptime: '', viewers: '' },
        errors: [],
      }),
    );
  pending[1]!.resolve(response());
  await vi.advanceTimersByTimeAsync(30000);
  expect(pending.at(-1)?.url).toBe('/api/channels/room?refresh=7TV%2CBTTV');
  expect(pending).toHaveLength(3);
  client.setChannels(['other']);
  await vi.advanceTimersByTimeAsync(30000);
  expect(pending.at(-1)?.url).toBe('/api/channels/other');
});

it('manual refresh cancels stale reads and enforces a cooldown without reconnecting chat', async () => {
  const pending: { signal: AbortSignal; resolve: (value: Response) => void }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((resolve) => pending.push({ signal: init.signal!, resolve })),
    ),
  );
  const receive = vi.fn();
  client = new MetadataClient(['room'], receive, vi.fn());
  client.start();
  expect(client.refresh()).toBe(true);
  expect(pending[0]?.signal.aborted).toBe(true);
  expect(client.refresh()).toBe(false);
  const response = () =>
    new Response(
      JSON.stringify({
        channel: 'room',
        emotes: {},
        badges: {},
        stream: { title: '', uptime: '', viewers: '' },
        errors: [],
      }),
    );
  pending[0]?.resolve(response());
  pending[1]?.resolve(response());
  await vi.waitFor(() => expect(receive).toHaveBeenCalledOnce());
  client.stop();
  expect(client.refresh()).toBe(false);
});
