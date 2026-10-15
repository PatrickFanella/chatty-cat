import { afterEach, expect, it, vi } from 'vitest';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
it('caches pinned local emoji in a separate bounded 128-entry bucket', async () => {
  const handlers = new Map<string, (event: unknown) => void>(),
    remove = vi.fn(async (_request: Request) => true),
    put = vi.fn(async () => {}),
    open = vi.fn(async () => ({
      match: async () => undefined,
      put,
      keys: async () =>
        Array.from(
          { length: 129 },
          (_, i) => new Request('https://chat.subcult.tv/emoji/twemoji-17.0.3/' + i.toString(16) + '.svg'),
        ),
      delete: remove,
    }));
  vi.stubGlobal('caches', { open });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('<svg/>', { headers: { 'Content-Type': 'image/svg+xml' } })),
  );
  vi.stubGlobal('self', {
    location: { origin: 'https://chat.subcult.tv' },
    addEventListener: (name: string, handler: (event: unknown) => void) => handlers.set(name, handler),
  });
  await import('./service-worker');
  let pending: Promise<Response> | undefined;
  handlers.get('fetch')?.({
    request: new Request('https://chat.subcult.tv/emoji/twemoji-17.0.3/1faea.svg'),
    respondWith: (value: Promise<Response>) => {
      pending = value;
    },
  });
  expect(pending).toBeDefined();
  await pending;
  expect(open).toHaveBeenCalledWith('chatthing-emoji-17-v1');
  expect(put).toHaveBeenCalledOnce();
  expect(remove).toHaveBeenCalledOnce();
});
