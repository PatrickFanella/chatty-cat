// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import type { ChatMessage } from './protocol';

afterEach(() => {
  window.dispatchEvent(new Event('pagehide'));
  document.body.replaceChildren();
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
});

it.each(['fresh live', 'saved reader', 'resume before history'] as const)(
  'preserves %s intent when delayed history arrives',
  async (scenario) => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal('innerWidth', 1280);
    vi.stubGlobal('innerHeight', 800);
    history.replaceState(null, '', '/?channel=one&video=off');
    const { WorkspaceStore } = await import('./workspaces');
    const { defaultDisplay } = await import('./display');
    const workspaces = new WorkspaceStore();
    const workspace = workspaces.create('Watching', {
      channels: ['one'],
      target: 'one',
      focus: 'log',
      settings: { version: 1, display: { ...defaultDisplay(), split: 1 }, extras: {} },
      readers: scenario === 'fresh live' ? [] : [{ column: 0, key: 'one:saved', offset: 12 }],
    });
    workspaces.activate(workspace.id);
    const html = readFileSync(process.cwd() + '/index.html', 'utf8')
      .replace(/<link[^>]+>/g, '')
      .replace(/<script[\s\S]*?<\/script>/g, '');
    document.body.innerHTML = new DOMParser().parseFromString(html, 'text/html').body.innerHTML;
    vi.stubGlobal(
      'WebSocket',
      class {
        close() {}
      },
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), location.href);
        if (url.pathname === '/api/public-config') return new Response('{}');
        if (url.pathname === '/api/auth/session')
          return new Response(JSON.stringify({ enabled: false, authenticated: false, loginURL: '/api/auth/login' }));
        if (url.pathname.startsWith('/api/channels/'))
          return new Response(
            JSON.stringify({
              channel: 'one',
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
    let resolveHistory!: (messages: ChatMessage[]) => void;
    const historyResult = new Promise<ChatMessage[]>((resolve) => {
      resolveHistory = resolve;
    });
    const { MessageArchive } = await import('./archive');
    vi.spyOn(MessageArchive.prototype, 'recent').mockReturnValue(historyResult);
    const { SplitLog } = await import('./split-log');
    const restore = vi.spyOn(SplitLog.prototype, 'restoreReaders');
    const render = vi.spyOn(SplitLog.prototype, 'set');
    await (await import('./main')).startMain();
    const latest = document.querySelector<HTMLButtonElement>('#latest')!;
    if (scenario !== 'fresh live') expect(restore).toHaveBeenCalled();
    if (scenario === 'resume before history') latest.click();
    restore.mockClear();
    resolveHistory(
      Array.from({ length: 60 }, (_, i) => ({
        id: i === 10 ? 'saved' : String(i),
        command: 'PRIVMSG',
        channel: 'one',
        login: 'fixture',
        text: 'Delayed history ' + i,
        timestamp: i + 1,
        tags: {},
      })),
    );
    await vi.waitFor(() => expect(document.querySelector('#count')?.textContent).toContain('60 messages'));
    expect((render.mock.contexts.at(-1) as InstanceType<typeof SplitLog>).allFollowing()).toBe(
      scenario !== 'saved reader',
    );
    if (scenario === 'saved reader') {
      expect(restore).toHaveBeenCalled();
      expect(latest.hidden).toBe(false);
    } else {
      expect(restore).not.toHaveBeenCalled();
      expect(latest.hidden).toBe(true);
    }
  },
);
