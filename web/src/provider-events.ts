import { clockTask, stopClockTask } from './shell/clock';
import { ownedDeadline, clearOwnedDeadline } from './resource-timers';
import type { AuthStatus } from './auth';
import { getProfileScope } from './account-profiles';
import { getProviderPreferences } from './provider-preferences';
import { privacyEnabled } from './privacy';
import { setLiveCosmeticLookup } from './cosmetics';
import type { ChannelMetadata } from './metadata';
import {
  LIVE_PROVIDERS,
  ProviderBadges,
  parseProviderCapabilities,
  providerEventPlan,
  record,
  refreshTargets,
  type LiveProvider,
  type Subscription,
} from './provider-events-model';

const ENDPOINTS: Record<LiveProvider, string> = {
  BTTV: 'wss://sockets.betterttv.net/ws',
  '7TV': 'wss://events.7tv.io/v3',
};
interface Connection {
  socket: WebSocket;
  provider: LiveProvider;
  queue: string[];
  ready: boolean;
  hello: boolean;
  heartbeat: number;
  lastBeat: number;
  opened: number;
  frames: number;
  bytes: number;
  window: number;
  nextSend: number;
}
// Read connections never announce by themselves. BTTV activity requires the separate reviewed session.
export class ProviderEventClient {
  private activityAttempts = new Map<string, number>();
  private lastAttempt = -Infinity;
  private scope = getProfileScope();
  private generation = 0;
  private stopped = false;
  private suspended = false;
  private abort = new AbortController();
  private configTimer: ReturnType<typeof setTimeout> | undefined;
  private reconcileTimer: ReturnType<typeof setTimeout> | undefined;
  private deadline: ReturnType<typeof setTimeout> | undefined;
  private pruneTimer: ReturnType<typeof clockTask> | undefined;
  private pumpPending = false;
  private paintPending = false;
  private paintDirty = false;
  private announced = false;
  private connections: Connection[] = [];
  private allowed: LiveProvider[] = [];
  private preferences = '';
  private signature = '';
  private badges = new ProviderBadges();
  constructor(
    private metadata: () => readonly ChannelMetadata[],
    private changed: () => void,
    private hint: (provider: LiveProvider, channel: string) => void,
    private status: (detail: string) => void,
  ) {
    document.addEventListener('privacychange', this.privacy);
    document.addEventListener('visibilitychange', this.visiblePaint);
    for (const provider of LIVE_PROVIDERS)
      setLiveCosmeticLookup(provider, (id) =>
        this.valid() && this.allowed.includes(provider) ? this.badges.forUser(provider, id) : [],
      );
  }
  private preferenceSignature(): string {
    const p = getProviderPreferences();
    return JSON.stringify([
      p.sevenTVEventAPI,
      p.cosmetics.BTTV,
      p.cosmetics['7TV'],
      p.providers['7TV'],
      p.providers.BTTV,
      p.activity,
    ]);
  }
  private opted(): boolean {
    const p = getProviderPreferences();
    return p.sevenTVEventAPI || p.cosmetics.BTTV || p.activity.BTTV || p.activity['7TV'];
  }
  private valid(): boolean {
    return !this.stopped && !this.suspended && !privacyEnabled() && getProfileScope() === this.scope;
  }
  start(): void {
    this.preferences = this.preferenceSignature();
    if (this.valid() && this.opted()) {
      if (Date.now() - this.lastAttempt < 30000) {
        this.suspended = true;
        this.status('Wait 30 seconds between optional provider connection attempts, then use Reconnect.');
        return;
      }
      this.lastAttempt = Date.now();
      void this.configure();
    } else this.status('Optional provider event services are off.');
  }
  authChanged(auth: AuthStatus | undefined): void {
    if (!auth || (auth.authenticated ? auth.userID : 'anonymous') !== this.scope) this.suspend();
  }
  private async configure(): Promise<void> {
    if (!this.valid() || !this.opted()) return;
    const generation = this.generation;
    try {
      const response = await fetch('/api/provider-services/config', {
        credentials: 'omit',
        cache: 'no-store',
        signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(12000)]),
      });
      if (!response.ok) throw new Error('Configuration unavailable');
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Missing configuration');
      let size = 0,
        text = '';
      const decoder = new TextDecoder();
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 4096) throw new Error('Configuration exceeds limit');
          text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
      } finally {
        await reader.cancel();
      }
      const providers = parseProviderCapabilities(JSON.parse(text));
      if (!providers) throw new Error('Invalid configuration');
      if (!this.valid() || generation !== this.generation) return;
      this.allowed = providers;
      this.reconcile();
    } catch {
      if (generation === this.generation && this.valid()) {
        this.disconnect();
        this.suspended = true;
        this.status('Optional provider configuration unavailable. Chat continues; use Reconnect to retry.');
      }
    }
    if (generation === this.generation && this.valid())
      this.configTimer = ownedDeadline(
        'provider.config-refresh',
        () => {
          void this.configure();
        },
        60000,
      );
  }
  metadataChanged(): void {
    if (!this.valid()) return;
    clearOwnedDeadline(this.reconcileTimer);
    this.reconcileTimer = ownedDeadline(
      'provider.reconcile',
      () => {
        this.reconcileTimer = undefined;
        this.reconcile();
      },
      1000,
    );
  }
  preferencesChanged(): void {
    if (this.stopped) return;
    this.reset();
    this.scope = getProfileScope();
    this.suspended = false;
    this.start();
  }
  reconnect(): void {
    this.preferencesChanged();
  }
  announceBTTV(auth: AuthStatus, channelID: string): boolean {
    if (
      !this.valid() ||
      !auth.authenticated ||
      auth.userID !== this.scope ||
      !getProviderPreferences().activity.BTTV ||
      !this.allowed.includes('BTTV') ||
      !/^\d{1,32}$/.test(channelID) ||
      !this.metadata()
        .slice(0, 24)
        .some((m) => m.broadcasterID === channelID)
    )
      return false;
    const connection = this.connections.find((c) => c.provider === 'BTTV'),
      key = auth.userID + ':' + channelID;
    if (
      !connection?.ready ||
      connection.queue.length ||
      connection.socket.readyState !== WebSocket.OPEN ||
      connection.socket.bufferedAmount > 65536 ||
      Date.now() - (this.activityAttempts.get(key) ?? -Infinity) < 300000
    )
      return false;
    this.activityAttempts.delete(key);
    this.activityAttempts.set(key, Date.now());
    while (this.activityAttempts.size > 24) this.activityAttempts.delete(this.activityAttempts.keys().next().value!);
    try {
      connection.socket.send(
        JSON.stringify({
          name: 'broadcast_me',
          data: { provider: 'twitch', providerId: auth.userID, channel: 'twitch:' + channelID },
        }),
      );
      return true;
    } catch {
      this.fail();
      return false;
    }
  }
  private reconcile(): void {
    if (!this.valid()) return;
    const plan = providerEventPlan(this.metadata(), getProviderPreferences(), this.allowed),
      signature = JSON.stringify(plan);
    if (signature === this.signature) return;
    this.disconnect();
    this.signature = signature;
    if (plan.bttv.length)
      this.connect(
        'BTTV',
        plan.bttv.map((id) => JSON.stringify({ name: 'join_channel', data: { name: 'twitch:' + id } })),
      );
    for (let i = 0; i < plan.sevenTV.length; i += 80)
      this.connect(
        '7TV',
        plan.sevenTV.slice(i, i + 80).map((s: Subscription) => JSON.stringify({ op: 35, d: s })),
      );
    if (this.connections.length) {
      this.pruneTimer = clockTask(
        'provider.badges',
        () => {
          if (this.badges.prune(Date.now())) this.schedulePaint();
        },
        5000,
        { active: () => this.connections.length > 0 },
      );
      this.requestPump();
      this.status(
        'Optional provider read connections opening. Joined channel IDs are sent directly to configured providers; activity sharing requires a separate reviewed session.',
      );
    } else
      this.status('No optional provider subscriptions are enabled for the configured services and current channels.');
  }
  private connect(provider: LiveProvider, queue: string[]): void {
    if (!this.valid()) return;
    if (this.connections.length >= 3) {
      this.fail();
      return;
    }
    const generation = this.generation;
    let socket: WebSocket;
    try {
      socket = new WebSocket(ENDPOINTS[provider]);
    } catch {
      this.fail();
      return;
    }
    const now = Date.now(),
      connection: Connection = {
        socket,
        provider,
        queue,
        ready: false,
        hello: false,
        heartbeat: 0,
        lastBeat: now,
        opened: now,
        frames: 0,
        bytes: 0,
        window: now,
        nextSend: now,
      };
    this.connections.push(connection);
    const current = (): boolean => {
      if (generation !== this.generation || !this.connections.includes(connection)) return false;
      if (!this.valid() || this.preferences !== this.preferenceSignature()) {
        this.suspend();
        return false;
      }
      return true;
    };
    socket.onopen = () => {
      if (!current()) return;
      connection.ready = provider === 'BTTV';
      connection.opened = Date.now();
      connection.lastBeat = Date.now();
      this.requestPump();
    };
    socket.onmessage = (event) => {
      if (!current()) return;
      const now = Date.now();
      if (now - connection.window >= 60000) {
        connection.window = now;
        connection.frames = 0;
        connection.bytes = 0;
      }
      if (
        typeof event.data !== 'string' ||
        event.data.length > 65536 ||
        new TextEncoder().encode(event.data).length > 65536 ||
        ++connection.frames > 1200 ||
        (connection.bytes += new TextEncoder().encode(event.data).length) > 2 * 1024 * 1024
      ) {
        this.fail();
        return;
      }
      let value: unknown;
      try {
        value = JSON.parse(event.data);
      } catch {
        this.fail();
        return;
      }
      if (provider === '7TV') {
        if (!record(value) || !Number.isInteger(value.op)) {
          this.fail();
          return;
        }
        if (value.op === 1) {
          if (
            connection.hello ||
            !record(value.d) ||
            typeof value.d.heartbeat_interval !== 'number' ||
            !Number.isFinite(value.d.heartbeat_interval) ||
            value.d.heartbeat_interval < 10000 ||
            value.d.heartbeat_interval > 120000 ||
            typeof value.d.subscription_limit !== 'number' ||
            !Number.isInteger(value.d.subscription_limit) ||
            value.d.subscription_limit < connection.queue.length
          ) {
            this.fail();
            return;
          }
          connection.hello = true;
          connection.heartbeat = value.d.heartbeat_interval;
          connection.lastBeat = now;
          connection.ready = true;
          this.requestPump();
          return;
        }
        if (!connection.hello) {
          this.fail();
          return;
        }
        if (value.op === 2) {
          connection.lastBeat = now;
          this.requestPump();
          return;
        }
        if (value.op === 4 || value.op === 6 || value.op === 7) {
          this.fail();
          return;
        }
        if (value.op !== 0) return;
      }
      const prefs = getProviderPreferences();
      for (const channel of refreshTargets(provider, value, this.metadata(), prefs)) this.hint(provider, channel);
      if (prefs.cosmetics[provider] && this.badges.accept(provider, value, now)) this.schedulePaint();
      this.requestPump();
    };
    socket.onerror = () => {
      if (current()) this.fail();
    };
    socket.onclose = () => {
      if (current()) this.fail();
    };
  }
  private requestPump(): void {
    if (this.pumpPending) return;
    this.pumpPending = true;
    const generation = this.generation;
    queueMicrotask(() => {
      if (generation !== this.generation) return;
      this.pumpPending = false;
      this.pump();
    });
  }
  private scheduleDeadline(): void {
    clearOwnedDeadline(this.deadline);
    this.deadline = undefined;
    const deadlines = this.connections.flatMap((connection) => [
      ...(!connection.ready ? [connection.opened + 12001] : []),
      ...(connection.heartbeat ? [connection.lastBeat + connection.heartbeat * 2 + 5001] : []),
      ...(connection.ready && connection.queue.length ? [connection.nextSend] : []),
    ]);
    const next = Math.min(...deadlines);
    if (Number.isFinite(next))
      this.deadline = ownedDeadline(
        'provider.protocol',
        () => {
          this.deadline = undefined;
          this.requestPump();
        },
        Math.max(1, next - Date.now()),
      );
  }
  private pump = (): void => {
    if (!this.valid() || this.preferences !== this.preferenceSignature()) {
      this.suspend();
      return;
    }
    const now = Date.now();
    for (const connection of this.connections) {
      if (
        (!connection.ready && now - connection.opened > 12000) ||
        (connection.heartbeat && now - connection.lastBeat > connection.heartbeat * 2 + 5000) ||
        connection.socket.bufferedAmount > 65536
      ) {
        this.fail();
        return;
      }
      if (
        connection.ready &&
        connection.socket.readyState === WebSocket.OPEN &&
        connection.queue.length &&
        now >= connection.nextSend
      ) {
        try {
          connection.socket.send(connection.queue.shift()!);
          connection.nextSend = now + 50;
          if (connection.socket.bufferedAmount > 65536) {
            this.fail();
            return;
          }
        } catch {
          this.fail();
          return;
        }
      }
    }
    if (!this.announced && this.connections.length && this.connections.every((c) => c.ready && !c.queue.length)) {
      this.announced = true;
      this.status(
        'Optional provider read subscriptions sent. Activity sharing requires a separate reviewed session; provider failures require explicit Reconnect.',
      );
    }
    this.scheduleDeadline();
  };
  private visiblePaint = (): void => {
    if (!document.hidden && this.paintDirty) this.schedulePaint();
  };
  private schedulePaint(): void {
    this.paintDirty = true;
    if (document.hidden || this.paintPending) return;
    this.paintPending = true;
    const generation = this.generation;
    queueMicrotask(() => {
      if (generation !== this.generation) return;
      this.paintPending = false;
      if (this.valid() && !document.hidden) {
        this.paintDirty = false;
        this.changed();
      }
    });
  }
  private fail(): void {
    this.suspend();
    this.status('Optional provider connection ended or exceeded its limits. Chat continues; use Reconnect to retry.');
  }
  private disconnect(): void {
    clearOwnedDeadline(this.deadline);
    this.deadline = undefined;
    stopClockTask(this.pruneTimer);
    this.pruneTimer = undefined;
    this.pumpPending = false;
    this.paintPending = false;
    this.paintDirty = false;
    this.announced = false;
    const connections = this.connections;
    this.connections = [];
    for (const { socket } of connections) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
      socket.close();
    }
    const hadBadges = this.badges.sizes().users > 0;
    this.badges.clear();
    if (hadBadges && !this.stopped) this.changed();
  }
  private reset(): void {
    clearOwnedDeadline(this.reconcileTimer);
    this.reconcileTimer = undefined;
    this.generation++;
    this.abort.abort();
    this.abort = new AbortController();
    clearOwnedDeadline(this.configTimer);
    this.configTimer = undefined;
    this.disconnect();
    this.allowed = [];
    this.signature = '';
  }
  private suspend(): void {
    this.reset();
    this.suspended = true;
    this.status('Optional provider services disconnected. Reconnect after leaving privacy mode or changing accounts.');
  }
  private privacy = (): void => {
    if (privacyEnabled()) this.suspend();
  };
  stop(): void {
    this.stopped = true;
    this.reset();
    document.removeEventListener('privacychange', this.privacy);
    document.removeEventListener('visibilitychange', this.visiblePaint);
    for (const provider of LIVE_PROVIDERS) setLiveCosmeticLookup(provider, undefined);
  }
}
