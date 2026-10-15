import { validOverlayAppearance, type OverlayAppearance } from './overlay-appearance';
import type { AuthStatus } from './auth';
import { getProfileScope } from './account-profiles';
import { privacyEnabled } from './privacy';
const base = 'http://127.0.0.1:47831';
export const PLAYBACK_QUALITIES = [
  'best',
  'worst',
  'audio_only',
  '160p',
  '360p',
  '480p',
  '720p',
  '720p60',
  '1080p',
  '1080p60',
  '1440p60',
] as const;
export interface PlaybackRequest {
  tool: string;
  channel: string;
  quality: string;
  requestID: string;
}
interface PlaybackJob {
  id: string;
  tool: string;
  channel: string;
  quality: string;
  state: 'running' | 'exited';
  exitCode?: number;
}
export interface DesktopStatus {
  version: 1;
  platform: string;
  tools: { id: string; label: string; available: boolean }[];
  jobs: PlaybackJob[];
  overlayAvailable?: boolean;
}
function record(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
function validPlan(v: PlaybackRequest): boolean {
  return (
    /^[a-z0-9_-]{1,32}$/.test(v.tool) &&
    /^[a-z0-9_]{1,25}$/.test(v.channel) &&
    PLAYBACK_QUALITIES.some((q) => q === v.quality) &&
    /^[A-Za-z0-9_-]{1,64}$/.test(v.requestID)
  );
}
function job(v: unknown): PlaybackJob {
  if (
    !record(v) ||
    !validPlan({
      tool: String(v.tool),
      channel: String(v.channel),
      quality: String(v.quality),
      requestID: String(v.id),
    }) ||
    (v.state !== 'running' && v.state !== 'exited') ||
    (v.exitCode !== undefined &&
      (!Number.isSafeInteger(v.exitCode) || Number(v.exitCode) < -1 || Number(v.exitCode) > 255))
  )
    throw new Error('Invalid companion launch receipt');
  return v as unknown as PlaybackJob;
}
export class DesktopCompanion {
  private token = '';
  private scope = '';
  private session = '';
  private observed = '';
  private generation = 0;
  private abort = new AbortController();
  constructor(private auth: () => AuthStatus | undefined) {
    this.observed = this.identity();
  }
  private identity(): string {
    const a = this.auth();
    return a?.authenticated ? (a.userID ?? '') + ':' + (a.csrf ?? '') : '';
  }
  private account(): string {
    const a = this.auth();
    if (
      privacyEnabled() ||
      !a?.authenticated ||
      !a.userID ||
      !/^[1-9][0-9]{0,19}$/.test(a.userID) ||
      getProfileScope() !== a.userID
    )
      throw new Error('Pair the current signed-in account outside privacy mode');
    return a.userID;
  }
  private valid(account: string, generation: number): void {
    if (this.account() !== account || this.generation !== generation)
      throw new Error('Companion account or session changed; pair again');
  }
  private async read(path: string, method: string, account: string, token: string, body?: unknown): Promise<unknown> {
    const options: RequestInit & { targetAddressSpace: 'loopback' } = {
      method,
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      targetAddressSpace: 'loopback',
      signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(10000)]),
      headers: {
        'Content-Type': 'application/json',
        'X-Companion-Account': account,
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    };
    const r = await fetch(base + path, options);
    if (!r.ok) throw new Error('Desktop companion HTTP ' + r.status + '; no automatic retry');
    if (method === 'DELETE') return null;
    const reader = r.body?.getReader();
    if (!reader) throw new Error('Missing companion response');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 32768) throw new Error('Companion response exceeds limit');
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    const all = new Uint8Array(size);
    let offset = 0;
    for (const part of chunks) {
      all.set(part, offset);
      offset += part.length;
    }
    return JSON.parse(new TextDecoder().decode(all));
  }
  async pair(code: string): Promise<void> {
    if (!/^[a-f0-9]{64}$/.test(code)) throw new Error('Enter the code printed by your installed companion');
    if (this.token) throw new Error('Unpair before pairing again');
    const account = this.account(),
      generation = this.generation;
    const value = await this.read('/v1/pair', 'POST', account, '', { code, account });
    if (
      !record(value) ||
      value.version !== 1 ||
      value.account !== account ||
      typeof value.token !== 'string' ||
      !/^[a-f0-9]{64}$/.test(value.token)
    )
      throw new Error('Invalid companion pairing response');
    try {
      this.valid(account, generation);
    } catch (error) {
      this.revoke(account, value.token);
      throw error;
    }
    this.scope = account;
    this.session = this.auth()?.csrf ?? '';
    this.token = value.token;
  }
  private context(): { account: string; token: string; generation: number } {
    const account = this.account();
    if (!this.token || this.scope !== account || this.session !== this.auth()?.csrf)
      throw new Error('Pair this account first');
    return { account, token: this.token, generation: this.generation };
  }
  async status(): Promise<DesktopStatus> {
    const c = this.context(),
      v = await this.read('/v1/status', 'GET', c.account, c.token);
    this.valid(c.account, c.generation);
    if (
      !record(v) ||
      v.version !== 1 ||
      !['darwin', 'linux', 'windows', 'freebsd', 'openbsd'].includes(String(v.platform)) ||
      !Array.isArray(v.tools) ||
      v.tools.length > 8 ||
      (!Array.isArray(v.jobs) && v.jobs !== null)
    )
      throw new Error('Invalid companion status');
    const tools = v.tools.map((t) => {
      if (
        !record(t) ||
        typeof t.id !== 'string' ||
        !/^[a-z0-9_-]{1,32}$/.test(t.id) ||
        typeof t.label !== 'string' ||
        t.label.length > 64 ||
        typeof t.available !== 'boolean'
      )
        throw new Error('Invalid playback tool');
      return { id: t.id, label: t.label, available: t.available };
    });
    const jobs = (v.jobs ?? []) as unknown[];
    if (jobs.length > 32) throw new Error('Companion history exceeds limit');
    return {
      version: 1,
      platform: String(v.platform),
      tools,
      jobs: jobs.map(job),
      overlayAvailable: v.overlayAvailable === true,
    };
  }
  async launch(plan: PlaybackRequest): Promise<PlaybackJob> {
    if (!validPlan(plan)) throw new Error('Invalid playback request');
    const c = this.context(),
      v = await this.read('/v1/launch', 'POST', c.account, c.token, plan);
    this.valid(c.account, c.generation);
    const result = job(v);
    if (
      result.id !== plan.requestID ||
      result.tool !== plan.tool ||
      result.channel !== plan.channel ||
      result.quality !== plan.quality
    )
      throw new Error('Companion receipt did not match; check status before another launch');
    return result;
  }
  async overlayStatus(): Promise<OverlayState> {
    const c = this.context(),
      v = await this.read('/v1/overlay', 'GET', c.account, c.token);
    this.valid(c.account, c.generation);
    return parseOverlayState(v);
  }
  async overlay(action: OverlayAction): Promise<OverlayState> {
    if (
      !/^[A-Za-z0-9_-]{1,64}$/.test(action.requestID) ||
      !['open', 'update', 'recover', 'close'].includes(action.kind) ||
      (action.kind === 'open' || action.kind === 'update') !== !!action.settings ||
      (action.settings && !validOverlaySettings(action.settings))
    )
      throw new Error('Invalid overlay action');
    const c = this.context(),
      v = await this.read('/v1/overlay', 'POST', c.account, c.token, action);
    this.valid(c.account, c.generation);
    return parseOverlayState(v);
  }
  private revoke(account: string, token: string): void {
    const options: RequestInit & { targetAddressSpace: 'loopback' } = {
      method: 'DELETE',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      keepalive: true,
      targetAddressSpace: 'loopback',
      signal: AbortSignal.timeout(3000),
      headers: { Authorization: 'Bearer ' + token, 'X-Companion-Account': account },
    };
    void fetch(base + '/v1/pair', options).catch(() => {});
  }
  disconnect(): void {
    const { scope, token } = this;
    this.generation++;
    this.abort.abort();
    this.abort = new AbortController();
    this.token = '';
    this.scope = '';
    this.session = '';
    if (scope && token) this.revoke(scope, token);
  }
  authChanged(): boolean {
    const identity = this.identity();
    if (identity !== this.observed) {
      this.observed = identity;
      this.disconnect();
      return true;
    }
    return false;
  }
}

export interface OverlaySettings {
  channel: string;
  opacity: number;
  scale: number;
  width: number;
  height: number;
  shadow: boolean;
  clickThrough: boolean;
  appearance?: OverlayAppearance;
}
export interface OverlayState {
  open: boolean;
  interactive: boolean;
  settings: OverlaySettings;
  x: number;
  y: number;
  recovery: string;
}
export interface OverlayAction {
  kind: 'open' | 'update' | 'recover' | 'close';
  requestID: string;
  settings?: OverlaySettings;
}
export function validOverlaySettings(v: unknown): v is OverlaySettings {
  return (
    record(v) &&
    typeof v.channel === 'string' &&
    /^[a-z0-9_]{1,25}$/.test(v.channel) &&
    typeof v.opacity === 'number' &&
    v.opacity >= 0.2 &&
    v.opacity <= 1 &&
    typeof v.scale === 'number' &&
    v.scale >= 0.5 &&
    v.scale <= 2 &&
    Number.isInteger(v.width) &&
    Number(v.width) >= 240 &&
    Number(v.width) <= 1600 &&
    Number.isInteger(v.height) &&
    Number(v.height) >= 200 &&
    Number(v.height) <= 1600 &&
    typeof v.shadow === 'boolean' &&
    typeof v.clickThrough === 'boolean' &&
    (v.appearance === undefined || validOverlayAppearance(v.appearance))
  );
}
export function parseOverlayState(v: unknown): OverlayState {
  if (
    !record(v) ||
    typeof v.open !== 'boolean' ||
    typeof v.interactive !== 'boolean' ||
    typeof v.recovery !== 'string' ||
    v.recovery.length > 200 ||
    !Number.isSafeInteger(v.x) ||
    !Number.isSafeInteger(v.y) ||
    (v.open && !validOverlaySettings(v.settings))
  )
    throw new Error('Invalid native overlay state');
  return v as unknown as OverlayState;
}
