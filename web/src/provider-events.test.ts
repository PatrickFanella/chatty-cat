// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { ProviderEventClient } from './provider-events';
import { providerDefaults, setProviderPreferences } from './provider-preferences';
import { cosmeticBadges } from './cosmetics';
import { setProfileScope } from './account-profiles';
import type { ChannelMetadata } from './metadata';
class Socket {
  static all: Socket[] = [];
  static OPEN = 1;
  readyState = 0;
  bufferedAmount = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  constructor(readonly url: string) {
    Socket.all.push(this);
  }
  send(s: string): void {
    this.sent.push(s);
  }
  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }
  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }
  message(v: unknown): void {
    this.onmessage?.({ data: JSON.stringify(v) });
  }
}
const room: ChannelMetadata = {
  channel: 'room',
  broadcasterID: '42',
  sevenTV: { userID: 'owner', channelSetID: 'set', globalSetID: 'global' },
  emotes: {},
  badges: {},
  errors: [],
  stream: { title: '', viewers: '', uptime: '' },
};
let client: ProviderEventClient | undefined;
afterEach(() => {
  client?.stop();
  client = undefined;
  Socket.all = [];
  vi.unstubAllGlobals();
  vi.useRealTimers();
  localStorage.clear();
  setProfileScope('anonymous');
  setProviderPreferences(providerDefaults());
});
function setup() {
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', Socket);
  const fetcher = vi.fn(
    async () =>
      new Response(JSON.stringify({ providers: ['BTTV', '7TV'], maxChannels: 24, maxSockets: 3, refreshSeconds: 30 })),
  );
  vi.stubGlobal('fetch', fetcher);
  const changed = vi.fn(),
    hint = vi.fn(),
    status = vi.fn();
  client = new ProviderEventClient(() => [room], changed, hint, status);
  return { fetcher, changed, hint, status };
}
function enable() {
  const p = providerDefaults();
  p.sevenTVEventAPI = true;
  p.cosmetics.BTTV = true;
  p.cosmetics['7TV'] = true;
  setProviderPreferences(p);
}
it('does no optional network work by default and emits only paced read subscriptions after reviewed opt-in', async () => {
  const { fetcher } = setup();
  client!.start();
  await vi.advanceTimersByTimeAsync(1000);
  expect(fetcher).not.toHaveBeenCalled();
  expect(Socket.all).toHaveLength(0);
  enable();
  client!.preferencesChanged();
  await vi.advanceTimersByTimeAsync(1);
  expect(Socket.all).toHaveLength(2);
  const [bttv, seven] = Socket.all;
  bttv!.open();
  seven!.open();
  expect(seven!.sent).toHaveLength(0);
  seven!.message({ op: 1, d: { heartbeat_interval: 45000, subscription_limit: 80 } });
  await vi.advanceTimersByTimeAsync(500);
  expect(bttv!.sent.map((s) => JSON.parse(s))).toEqual([{ name: 'join_channel', data: { name: 'twitch:42' } }]);
  expect(seven!.sent).toHaveLength(6);
  expect(seven!.sent.map((s) => JSON.parse(s).op)).toEqual([35, 35, 35, 35, 35, 35]);
  expect(Socket.all.flatMap((s) => s.sent).join(' ')).not.toMatch(/broadcast_me|presence|"op":(33|37)/);
});
it('accepts scoped refresh hints, batches cosmetics and clears on privacy without stale callbacks or retry', async () => {
  const { hint, changed, fetcher } = setup();
  enable();
  client!.start();
  await vi.advanceTimersByTimeAsync(1);
  const [bttv, seven] = Socket.all;
  bttv!.open();
  seven!.open();
  seven!.message({ op: 1, d: { heartbeat_interval: 45000, subscription_limit: 80 } });
  await vi.advanceTimersByTimeAsync(500);
  seven!.message({ op: 0, d: { type: 'emote_set.update', body: { id: 'set' } } });
  seven!.message({ op: 0, d: { type: 'emote_set.update', body: { id: 'notjoined' } } });
  expect(hint.mock.calls).toEqual([['7TV', 'room']]);
  for (let i = 0; i < 10; i++)
    bttv!.message({
      name: 'lookup_user',
      data: { providerId: '2', badge: { url: 'https://cdn.betterttv.net/badges/pro.svg' } },
    });
  const before = changed.mock.calls.length;
  await vi.advanceTimersByTimeAsync(250);
  expect(changed.mock.calls.length - before).toBe(1);
  expect(cosmeticBadges('2')).toHaveLength(1);
  const late = seven!.onmessage;
  localStorage.setItem('chatthing:v1:privacy', JSON.stringify({ version: 1, enabled: true, allowed: [], panic: true }));
  document.dispatchEvent(new Event('privacychange'));
  expect(Socket.all.every((s) => s.readyState === 3)).toBe(true);
  expect(cosmeticBadges('2')).toEqual([]);
  late?.({ data: JSON.stringify({ op: 0, d: { type: 'emote_set.update', body: { id: 'set' } } }) });
  expect(hint).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(120000);
  expect(fetcher).toHaveBeenCalledOnce();
  expect(Socket.all).toHaveLength(2);
});
it('fails closed on oversized frames and heartbeat expiry, and reconnects only on explicit request', async () => {
  setup();
  enable();
  client!.start();
  await vi.advanceTimersByTimeAsync(1);
  const first = Socket.all[0]!;
  first.open();
  first.onmessage?.({ data: 'x'.repeat(65537) });
  await vi.advanceTimersByTimeAsync(61000);
  expect(Socket.all).toHaveLength(2);
  expect(Socket.all.every((s) => s.readyState === 3)).toBe(true);
  client!.reconnect();
  await vi.advanceTimersByTimeAsync(1);
  expect(Socket.all).toHaveLength(4);
  const seven = Socket.all[3]!;
  seven.open();
  seven.message({ op: 1, d: { heartbeat_interval: 10000, subscription_limit: 80 } });
  await vi.advanceTimersByTimeAsync(26000);
  expect(Socket.all.every((s) => s.readyState === 3)).toBe(true);
});
it('rejects stale configuration and closes the old profile before processing provider frames', async () => {
  setup();
  enable();
  client!.start();
  await vi.advanceTimersByTimeAsync(1);
  const socket = Socket.all[0]!;
  socket.open();
  setProfileScope('99');
  socket.message({ name: 'lookup_user', data: { providerId: '2', badge: { url: 'https://cdn.betterttv.net/a' } } });
  expect(Socket.all.every((s) => s.readyState === 3)).toBe(true);
  expect(cosmeticBadges('2')).toEqual([]);
  await vi.advanceTimersByTimeAsync(120000);
  expect(Socket.all).toHaveLength(2);
});
it('caps 24 rooms at three sockets and closes them when the operator removes capabilities', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', Socket);
  const fetcher = vi.fn(
    async () =>
      new Response(JSON.stringify({ providers: ['BTTV', '7TV'], maxChannels: 24, maxSockets: 3, refreshSeconds: 30 })),
  );
  vi.stubGlobal('fetch', fetcher);
  enable();
  client = new ProviderEventClient(
    () =>
      Array.from({ length: 100 }, (_, i) => ({
        ...room,
        channel: 'room' + i,
        broadcasterID: '' + i,
        sevenTV: { userID: 'owner' + i, channelSetID: 'set' + i, globalSetID: 'global' },
      })),
    vi.fn(),
    vi.fn(),
    vi.fn(),
  );
  client.start();
  await vi.advanceTimersByTimeAsync(1);
  expect(Socket.all).toHaveLength(3);
  for (const socket of Socket.all) {
    socket.open();
    if (socket.url.includes('7tv')) socket.message({ op: 1, d: { heartbeat_interval: 45000, subscription_limit: 80 } });
  }
  await vi.advanceTimersByTimeAsync(5000);
  expect(Socket.all.map((s) => s.sent.length)).toEqual([24, 80, 41]);
  fetcher.mockImplementation(
    async () => new Response(JSON.stringify({ providers: [], maxChannels: 24, maxSockets: 3, refreshSeconds: 30 })),
  );
  await vi.advanceTimersByTimeAsync(55000);
  expect(Socket.all.every((s) => s.readyState === 3)).toBe(true);
  expect(Socket.all).toHaveLength(3);
});
it('does not accept a late capability response after opt-out or authentication loss', async () => {
  setup();
  enable();
  let finish: (r: Response) => void = () => {};
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    ),
  );
  client!.start();
  setProviderPreferences(providerDefaults());
  client!.preferencesChanged();
  finish(
    new Response(JSON.stringify({ providers: ['BTTV', '7TV'], maxChannels: 24, maxSockets: 3, refreshSeconds: 30 })),
  );
  await vi.advanceTimersByTimeAsync(1000);
  expect(Socket.all).toHaveLength(0);
  client!.authChanged(undefined);
  enable();
  client!.metadataChanged();
  await vi.advanceTimersByTimeAsync(120000);
  expect(Socket.all).toHaveLength(0);
});
it('announces only the authenticated profile in a joined BTTV channel after the distinct activity opt-in', async () => {
  setup();
  setProfileScope('42');
  client!.stop();
  const p = providerDefaults();
  p.activity.BTTV = true;
  setProviderPreferences(p);
  client = new ProviderEventClient(() => [room], vi.fn(), vi.fn(), vi.fn());
  client.start();
  await vi.advanceTimersByTimeAsync(1);
  const socket = Socket.all[0]!;
  socket.open();
  await vi.advanceTimersByTimeAsync(100);
  const auth = {
    enabled: true,
    authenticated: true,
    loginURL: 'http://localhost/api/auth/login',
    userID: '42',
    login: 'fixture',
    csrf: 'fixture',
  };
  expect(client.announceBTTV({ ...auth, userID: '43' }, '42')).toBe(false);
  expect(client.announceBTTV(auth, 'notjoined')).toBe(false);
  expect(client.announceBTTV(auth, '42')).toBe(true);
  expect(client.announceBTTV(auth, '42')).toBe(false);
  expect(socket.sent.map((s) => JSON.parse(s))).toEqual([
    { name: 'join_channel', data: { name: 'twitch:42' } },
    { name: 'broadcast_me', data: { provider: 'twitch', providerId: '42', channel: 'twitch:42' } },
  ]);
});
