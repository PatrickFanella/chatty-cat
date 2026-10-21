import type { AuthStatus } from './auth';
import { getProfileScope } from './account-profiles';
import { privacyEnabled } from './privacy';
import { clearBrowserHandoff, readBrowserHandoff, saveBrowserHandoff } from './browser-companion-handoff';
interface Runtime {
  lastError?: { message?: string };
  sendMessage(id: string, message: unknown, callback: (value: unknown) => void): void;
}
interface Pair {
  extension: string;
  account: string;
  csrf: string;
  token: string;
}
export interface WatchedChannel {
  channel: string;
  seq: number;
}
function runtime(): Runtime | undefined {
  return (window as unknown as { chrome?: { runtime?: Runtime } }).chrome?.runtime;
}
function record(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
export class BrowserCompanion {
  private pairState: Pair | undefined;
  private generation = 0;
  private observed = '';
  private navigating = false;
  constructor(private auth: () => AuthStatus | undefined) {
    this.observed = this.identity();
  }
  private identity(): string {
    const a = this.auth();
    return a?.authenticated ? (a.userID ?? '') + ':' + (a.csrf ?? '') : '';
  }
  private account(): { id: string; csrf: string } {
    const a = this.auth();
    if (privacyEnabled() || !a?.authenticated || !a.userID || !a.csrf || getProfileScope() !== a.userID)
      throw new Error('Use the current signed-in account outside privacy mode');
    return { id: a.userID, csrf: a.csrf };
  }
  private async sessionFingerprint(): Promise<string> {
    const { id, csrf } = this.account();
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([id, csrf])));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  private async message(extension: string, message: unknown): Promise<unknown> {
    if (!/^[a-p]{32}$/.test(extension)) throw new Error('Enter the installed Chromium extension ID');
    const api = runtime();
    if (!api?.sendMessage) throw new Error('Install the Chromium companion; this browser exposes no extension bridge');
    return new Promise((resolve, reject) => {
      let finished = false;
      const timeout = window.setTimeout(() => {
        finished = true;
        reject(new Error('Browser companion timed out; reconnect explicitly'));
      }, 5000);
      try {
        api.sendMessage(extension, message, (v) => {
          if (finished) return;
          finished = true;
          clearTimeout(timeout);
          if (api.lastError) {
            reject(new Error('Browser companion disconnected or removed'));
            return;
          }
          if (!record(v) || v.ok !== true || v.version !== 1) {
            reject(
              new Error(
                record(v) && typeof v.error === 'string' ? v.error.slice(0, 200) : 'Invalid companion response',
              ),
            );
            return;
          }
          resolve(v);
        });
      } catch {
        finished = true;
        clearTimeout(timeout);
        reject(new Error('Browser companion unavailable'));
      }
    });
  }
  async pair(extension: string, code: string): Promise<void> {
    if (this.pairState) throw new Error('Unpair first');
    if (!/^[a-f0-9]{64}$/.test(code)) throw new Error('Enter a fresh one-use extension pairing code');
    const a = this.account(),
      generation = this.generation;
    const v = await this.message(extension, { version: 1, kind: 'pair', account: a.id, code });
    if (!record(v) || v.account !== a.id || typeof v.token !== 'string' || !/^[a-f0-9]{64}$/.test(v.token))
      throw new Error('Invalid browser companion pairing');
    const state = { extension, account: a.id, csrf: a.csrf, token: v.token };
    if (generation !== this.generation || this.identity() !== a.id + ':' + a.csrf) {
      this.revoke(state);
      throw new Error('Account/session changed during pairing');
    }
    this.pairState = state;
  }
  async poll(): Promise<WatchedChannel | null> {
    const a = this.account(),
      s = this.pairState,
      generation = this.generation;
    if (!s || s.account !== a.id || s.csrf !== a.csrf) throw new Error('Pair this account first');
    const v = await this.message(s.extension, { version: 1, kind: 'poll', account: a.id, token: s.token });
    if (generation !== this.generation || this.identity() !== a.id + ':' + a.csrf)
      throw new Error('Browser companion account changed');
    if (!record(v) || v.account !== a.id) throw new Error('Invalid companion account');
    const row = v.watched;
    if (row === null) return null;
    if (
      !record(row) ||
      typeof row.channel !== 'string' ||
      !/^[a-z0-9_]{1,25}$/.test(row.channel) ||
      !Number.isSafeInteger(row.seq) ||
      Number(row.seq) < 1 ||
      Number(row.seq) > 1000000
    )
      throw new Error('Invalid watched channel');
    return { channel: row.channel, seq: Number(row.seq) };
  }
  async prepareNavigation(workspace: string): Promise<void> {
    const a = this.account(),
      s = this.pairState,
      generation = this.generation;
    if (!s || s.account !== a.id || s.csrf !== a.csrf || !/^[a-zA-Z0-9_-]{1,128}$/.test(workspace))
      throw new Error('Pair this account before opening the reviewed workspace');
    const code = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join(
      '',
    );
    const session = await this.sessionFingerprint();
    if (generation !== this.generation || this.identity() !== a.id + ':' + a.csrf)
      throw new Error('Account/session changed before navigation');
    try {
      saveBrowserHandoff({
        extension: s.extension,
        account: a.id,
        code,
        session,
        workspace,
        expires: Date.now() + 30000,
      });
      await this.message(s.extension, { version: 1, kind: 'handoff', account: a.id, token: s.token, code, workspace });
      if (generation !== this.generation || this.identity() !== a.id + ':' + a.csrf)
        throw new Error('Account/session changed during navigation');
    } catch (error) {
      this.cancelNavigation();
      if (error instanceof Error && error.message === 'unsupported request')
        throw new Error('Load companion version 0.1.2 or newer, then pair and review again');
      throw error;
    }
  }
  navigationStarted(): void {
    this.navigating = true;
  }
  cancelNavigation(): void {
    this.navigating = false;
    clearBrowserHandoff();
    const s = this.pairState;
    if (s)
      void this.message(s.extension, { version: 1, kind: 'cancel-handoff', account: s.account, token: s.token }).catch(
        () => {},
      );
  }
  async resumeNavigation(workspace: string): Promise<string | undefined> {
    const handoff = readBrowserHandoff();
    clearBrowserHandoff();
    if (!handoff) return;
    const a = this.account(),
      generation = this.generation;
    if (
      this.pairState ||
      handoff.account !== a.id ||
      handoff.workspace !== workspace ||
      handoff.session !== (await this.sessionFingerprint())
    )
      throw new Error('Workspace handoff does not match this account/session');
    if (generation !== this.generation || this.identity() !== a.id + ':' + a.csrf)
      throw new Error('Account/session changed before resuming');
    const v = await this.message(handoff.extension, { version: 1, kind: 'resume', account: a.id, code: handoff.code });
    if (!record(v) || v.account !== a.id || typeof v.token !== 'string' || !/^[a-f0-9]{64}$/.test(v.token))
      throw new Error('Invalid browser companion navigation response');
    const state = { extension: handoff.extension, account: a.id, csrf: a.csrf, token: v.token };
    if (generation !== this.generation || this.identity() !== a.id + ':' + a.csrf) {
      this.revoke(state);
      throw new Error('Account/session changed while resuming');
    }
    this.pairState = state;
    return handoff.extension;
  }
  private revoke(s: Pair): void {
    void this.message(s.extension, { version: 1, kind: 'unpair', account: s.account, token: s.token }).catch(() => {});
  }
  disconnect(): void {
    this.generation++;
    this.navigating = false;
    clearBrowserHandoff();
    const s = this.pairState;
    this.pairState = undefined;
    if (s) this.revoke(s);
  }
  stop(): void {
    if (!this.navigating) this.disconnect();
    else {
      this.generation++;
      this.pairState = undefined;
    }
  }
  authChanged(): boolean {
    const identity = this.identity();
    if (identity !== this.observed) {
      const initial = this.observed === '' && !this.pairState;
      this.observed = identity;
      if (initial && identity) return false;
      this.disconnect();
      return true;
    }
    return false;
  }
}
