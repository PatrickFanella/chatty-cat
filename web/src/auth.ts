export type AuthStatus = {
  enabled: boolean;
  authenticated: boolean;
  loginURL: string;
  login?: string;
  userID?: string;
  csrf?: string;
  emotesEnabled?: boolean;
  personalChatEnabled?: boolean;
  whispersEnabled?: boolean;
  commandPermissions?: string[];
};

export function parseAuthStatus(value: unknown): AuthStatus {
  if (!value || typeof value !== 'object') throw new Error('Invalid login status');
  const data = value as Record<string, unknown>;
  if (typeof data['enabled'] !== 'boolean' || typeof data['authenticated'] !== 'boolean'
    || typeof data['loginURL'] !== 'string') throw new Error('Invalid login status');
  const url = new URL(data['loginURL']);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/api/auth/login'
    || (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:'))) throw new Error('Invalid login URL');
  const result: AuthStatus = { enabled: data['enabled'], authenticated: data['authenticated'], loginURL: url.href };
  if (result.authenticated) {
    result.whispersEnabled = data["whispersEnabled"] === true;
    result.personalChatEnabled = data["personalChatEnabled"] === true;
    result.emotesEnabled = data["emotesEnabled"] === true;
    const allowed = ["moderator:manage:banned_users", "moderator:manage:chat_messages", "moderator:manage:chat_settings", "moderator:manage:announcements", "user:manage:chat_color", "user:manage:whispers"];
    result.commandPermissions = Array.isArray(data["commandPermissions"]) ? allowed.filter(scope => (data["commandPermissions"] as unknown[]).includes(scope)) : [];
    for (const key of ['login', 'userID', 'csrf'] as const) {
      if (typeof data[key] !== 'string' || !data[key]) throw new Error('Invalid session');
      result[key] = data[key];
    }
  }
  return result;
}

export async function loadAuth(signal?: AbortSignal): Promise<AuthStatus> {
  const response = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store', signal: signal ?? AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error('Login status unavailable');
  return parseAuthStatus(await response.json());
}

export async function logout(csrf: string): Promise<void> {
  const response = await fetch('/api/auth/logout', {
    method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': csrf }, signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error('Could not sign out; try again');
}

export function mountAuth(button: HTMLButtonElement, label: HTMLElement, onChange: (status: AuthStatus | undefined) => void = () => {}): () => void {
  let session: AuthStatus | undefined;
  let disposed = false;
  let generation = 0;
  let changing = false;
  const query = new URL(location.href).searchParams;
  const notice = query.has('auth') ? query.get('auth') === 'denied' ? 'Twitch login was cancelled' : 'Twitch login failed; try again' : '';
  const controller = new AbortController();
  let sync: BroadcastChannel | undefined;
  const reload = (): void => { if (!changing) void update(); };
  try { if (typeof BroadcastChannel !== 'undefined') { sync = new BroadcastChannel('chatthing:v1:auth'); sync.addEventListener('message', reload); } } catch { /* optional sync */ }
  async function update(): Promise<void> {
    const current = ++generation;
    try {
      const data = await loadAuth(AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]));
      if (disposed || current !== generation) return;
      const changed = session !== undefined && (session.authenticated !== data.authenticated || session.login !== data.login);
      session = data;
      if (changed) { try { sync?.postMessage('changed'); } catch { /* optional sync */ } }
      onChange(data);
      button.disabled = !data.enabled;
      button.textContent = data.authenticated ? 'Sign out' : 'Log in with Twitch';
      label.textContent = data.authenticated ? `Signed in as ${data.login}` : data.enabled ? notice : 'Twitch login is not configured';
    } catch {
      if (!disposed && current === generation) { session = undefined; onChange(undefined); button.disabled = true; label.textContent = 'Login status unavailable'; }
    }
  }
  async function click(): Promise<void> {
    if (!session) return;
    generation++;
    changing = true;
    onChange(undefined);
    button.disabled = true;
    if (!session.authenticated) {
      const url = new URL(session.loginURL);
      const channel = new URL(location.href).searchParams.get('channel');
      if (channel) url.searchParams.set('channel', channel);
      location.assign(url);
      return;
    }
    try { await logout(session.csrf ?? ''); await update(); }
    catch (error) { if (!disposed) { label.textContent = error instanceof Error ? error.message : 'Could not sign out'; button.disabled = false; onChange(session); } }
    finally { changing = false; }
  }
  button.addEventListener('click', click);
  if (query.has('auth')) {
    label.textContent = query.get('auth') === 'denied' ? 'Twitch login was cancelled' : 'Twitch login failed; try again';
    const url = new URL(location.href); url.searchParams.delete('auth'); history.replaceState(null, '', url);
  }
  void update();
  const timer = setInterval(() => { if (!changing) void update(); }, 60000);
  return () => { disposed = true; controller.abort(); clearInterval(timer); sync?.removeEventListener('message', reload); sync?.close(); button.removeEventListener('click', click); };
}
