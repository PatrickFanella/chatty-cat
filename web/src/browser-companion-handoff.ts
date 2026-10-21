// Only an explicitly confirmed workspace navigation may carry a short-lived,
// one-use handoff in this tab. Pairing tokens and OAuth/CSRF values stay out.
const key = 'chatthing:v1:browser-companion-handoff';
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
      !/^[a-p]{32}$/.test(v.extension) ||
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
