// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { mountOverlay } from './overlay';
import { overlayRow } from './overlay-row';
import { setPresentation, presentationDefaults } from './presentation';
let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  document.body.replaceChildren();
  localStorage.clear();
  setPresentation({ ...presentationDefaults });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('renders safe public text, Unicode native emotes and deletion state without interaction controls', () => {
  const message = {
    id: 'one',
    command: 'PRIVMSG',
    channel: 'one',
    login: 'alice',
    text: '猫 Kappa <script>alert(1)</script>',
    timestamp: 100000,
    tags: { emotes: '25:2-6', 'display-name': 'Alice' },
  };
  const row = overlayRow(message, undefined, false, false, false);
  expect(row.querySelector('script')).toBeNull();
  expect(row.querySelector('img.emote')?.getAttribute('alt')).toBe('Kappa');
  expect(row.textContent).toContain('<script>');
  expect(row.querySelectorAll('button,input')).toHaveLength(0);
  setPresentation({ ...presentationDefaults, deletedLength: 2 });
  expect(overlayRow(message, undefined, false, true, true).querySelector('.message-body')?.textContent).toBe('猫 …');
});
it('starts only public transport/one metadata request and stops without persistence or repeating timers', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  class Socket {
    static instances: Socket[] = [];
    onmessage: ((event: MessageEvent) => void) | undefined;
    onclose: (() => void) | undefined;
    closed = false;
    constructor(readonly url: string) {
      Socket.instances.push(this);
    }
    close() {
      this.closed = true;
    }
  }
  vi.stubGlobal('WebSocket', Socket);
  const fetch = vi.fn().mockResolvedValue({ ok: false });
  vi.stubGlobal('fetch', fetch);
  const interval = vi.spyOn(globalThis, 'setInterval'),
    save = vi.spyOn(Storage.prototype, 'setItem');
  document.body.innerHTML = '<main class="chat-workspace"><div id="log"></div></main>';
  cleanup = mountOverlay(document.querySelector('#log')!, ['one']);
  expect(String(Socket.instances[0]!.url)).toContain('/api/chat?');
  expect(String(Socket.instances[0]!.url)).not.toContain('/auth/');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0]![0]).toBe('/api/channels/one');
  expect(interval).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
  expect(document.querySelectorAll('dialog,input,button')).toHaveLength(0);
  Socket.instances[0]!.onmessage?.(
    new MessageEvent('message', {
      data: JSON.stringify({
        type: 'message',
        replay: false,
        message: {
          id: 'one',
          command: 'PRIVMSG',
          channel: 'one',
          login: 'alice',
          text: 'hello',
          timestamp: Date.now(),
          tags: {},
        },
      }),
    }),
  );
  await new Promise((r) => setTimeout(r, 30));
  expect(document.querySelector('#log')?.textContent).toContain('hello');
  cleanup();
  cleanup = undefined;
  expect(Socket.instances[0]!.closed).toBe(true);
  expect(save).not.toHaveBeenCalled();
});
