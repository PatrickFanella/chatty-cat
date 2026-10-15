// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
class Socket {
  static all: Socket[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  closed = false;
  constructor(public url: URL) {
    Socket.all.push(this);
  }
  close(): void {
    this.closed = true;
    this.onclose?.();
  }
}
afterEach(() => {
  window.dispatchEvent(new Event('pagehide'));
  document.body.replaceChildren();
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.resetModules();
});
it('boots twelve channels, reuses duplicate pane sources and releases the last closed source group while preserving drafts', async () => {
  vi.stubGlobal('innerWidth', 1280);
  vi.stubGlobal('innerHeight', 800);
  localStorage.clear();
  sessionStorage.clear();
  const joined = Array.from({ length: 12 }, (_, i) => 'room' + String.fromCharCode(97 + i));
  history.replaceState(null, '', '/?channel=' + joined.join(',') + '&video=off');
  const html = readFileSync(process.cwd() + '/index.html', 'utf8')
    .replace(/<link[^>]+>/g, '')
    .replace(/<script[\s\S]*?<\/script>/g, '');
  const shell = new DOMParser().parseFromString(html, 'text/html');
  document.body.innerHTML = shell.body.innerHTML;
  vi.stubGlobal('WebSocket', Socket);
  Socket.all = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), location.href);
      if (url.pathname === '/api/public-config')
        return new Response(
          JSON.stringify({ giphyApiKey: '', paneChannels: 6, workspaceChannels: 12, subscriptions: 12 }),
        );
      if (url.pathname === '/api/auth/session')
        return new Response(
          JSON.stringify({
            enabled: false,
            authenticated: false,
            loginURL: new URL('/api/auth/login', location.href).href,
          }),
        );
      if (url.pathname.startsWith('/api/channels/'))
        return new Response(
          JSON.stringify({
            channel: url.pathname.split('/').at(-1),
            emotes: {},
            badges: {},
            emoteUse: {},
            errors: [],
            stream: { uptime: 'offline', viewers: '', title: '' },
          }),
        );
      return new Response('{}', { status: 404 });
    }),
  );
  await (await import('./main')).startMain();
  await vi.waitFor(() => expect(document.querySelectorAll('.split-pane')).toHaveLength(2));
  expect(Socket.all).toHaveLength(1);
  expect(Socket.all[0]?.url.searchParams.get('channels')?.split(',')).toHaveLength(12);
  const input = document.querySelector<HTMLTextAreaElement>('#message')!;
  input.value = 'Synthetic retained draft';
  input.dispatchEvent(new Event('input'));
  const paneAction = (pane: Element, label: string): HTMLButtonElement =>
    [...pane.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === label)!;
  paneAction(document.querySelector('.split-pane')!, 'Copy').click();
  await vi.waitFor(() => expect(document.querySelectorAll('.split-pane')).toHaveLength(3));
  expect(Socket.all).toHaveLength(1);
  paneAction(document.querySelectorAll('.split-pane')[0]!, 'Close').click();
  await vi.waitFor(() => expect(document.querySelectorAll('.split-pane')).toHaveLength(2));
  expect(Socket.all).toHaveLength(1);
  paneAction(document.querySelectorAll('.split-pane')[1]!, 'Close').click();
  await vi.waitFor(() => expect(document.querySelectorAll('.split-pane')).toHaveLength(1));
  expect(Socket.all).toHaveLength(2);
  expect(Socket.all[0]?.closed).toBe(true);
  expect(Socket.all[1]?.url.searchParams.get('channels')?.split(',')).toEqual(joined.slice(6));
  expect(sessionStorage.getItem('chatthing:v1:draft:anonymous:' + joined[0])).toBe('Synthetic retained draft');
  const saved = JSON.parse(localStorage.getItem('chatthing:v1:workspaces') ?? '{}');
  expect(saved.workspaces[0].channels).toHaveLength(12);
});
