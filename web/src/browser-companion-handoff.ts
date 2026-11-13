import { validBrowserCompanionID } from './browser-companion-id';
// Only an explicitly confirmed workspace navigation may carry a short-lived,
// one-use handoff in this tab. Pairing tokens and OAuth/CSRF values stay out.
const key = 'chatty-cat:v1:browser-companion-handoff';
export interface BrowserHandoff {
  extension: string;
  account: string;
  code: string;
  session: string;
  workspace: string;
  expires: number;
}
export function clearBrowserHandoff(): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* A failed write already prevents navigation handoff. */
  }
}
export function readBrowserHandoff(): BrowserHandoff | undefined {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return;
    if (raw.length > 1024) throw new Error();
    const v = JSON.parse(raw) as BrowserHandoff;
    if (
      !v ||
      typeof v.extension !== 'string' ||
      typeof v.account !== 'string' ||
      typeof v.code !== 'string' ||
      typeof v.session !== 'string' ||
      typeof v.workspace !== 'string' ||
      !validBrowserCompanionID(v.extension) ||
      !/^[1-9][0-9]{0,19}$/.test(v.account) ||
      !/^[a-f0-9]{64}$/.test(v.code) ||
      !/^[a-f0-9]{64}$/.test(v.session) ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(v.workspace) ||
      !Number.isSafeInteger(v.expires) ||
      v.expires < Date.now() ||
      v.expires > Date.now() + 30000
    )
      throw new Error();
    return v;
  } catch {
    clearBrowserHandoff();
    return;
  }
}
export function saveBrowserHandoff(value: BrowserHandoff): void {
  sessionStorage.setItem(key, JSON.stringify(value));
}

// While a tab is paired it also holds one reload code, so reloading the same tab
// resumes the bridge once. The extension binds the code to this tab and account
// and still enforces its heartbeat lease and eight-hour limit; no token is kept here.
const reloadKey = 'chatty-cat:v1:browser-companion-reload';
export interface BrowserReload {
  extension: string;
  account: string;
  code: string;
  session: string;
}
export function clearBrowserReload(): void {
  try {
    sessionStorage.removeItem(reloadKey);
  } catch {
    /* Without tab storage a reload simply disconnects. */
  }
}
export function readBrowserReload(): BrowserReload | undefined {
  try {
    const raw = sessionStorage.getItem(reloadKey);
    if (!raw) return;
    if (raw.length > 1024) throw new Error();
    const v = JSON.parse(raw) as BrowserReload;
    if (
      !v ||
      typeof v.extension !== 'string' ||
      typeof v.account !== 'string' ||
      typeof v.code !== 'string' ||
      typeof v.session !== 'string' ||
      !validBrowserCompanionID(v.extension) ||
      !/^[1-9][0-9]{0,19}$/.test(v.account) ||
      !/^[a-f0-9]{64}$/.test(v.code) ||
      !/^[a-f0-9]{64}$/.test(v.session)
    )
      throw new Error();
    return v;
  } catch {
    clearBrowserReload();
    return;
  }
}
export function saveBrowserReload(value: BrowserReload): void {
  sessionStorage.setItem(reloadKey, JSON.stringify(value));
}
