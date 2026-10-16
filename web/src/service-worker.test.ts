import { afterEach, expect, it, vi } from 'vitest';
import { REFERENCE_ASSETS } from './reference-assets';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
it('never answers hosted uploads from image cache and removes old cached uploads on activation', async () => {
  const listeners = new Map<string, (event: unknown) => void>(),
    remove = vi.fn(async (_request: Request) => true),
    match = vi.fn(),
    open = vi.fn(async (bucket: string) => ({
      keys: async () =>
        bucket === 'chatthing-images-v1'
          ? [
              new Request('https://chat.subcult.tv/uploads/' + 'a'.repeat(32)),
              new Request('https://cdn.example.com/emote.png'),
            ]
          : [],
      delete: remove,
      match,
    }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('fixture', { status: 200 })),
  );
  vi.stubGlobal('caches', {
    open,
    keys: async () => ['chatthing-shell-v1', 'chatthing-images-v1', 'chatthing-fonts-v1'],
  });
  vi.stubGlobal('self', {
    location: { origin: 'https://chat.subcult.tv' },
    clients: { claim: vi.fn(async () => {}) },
    addEventListener: (name: string, handler: (event: unknown) => void) => listeners.set(name, handler),
  });
  await import('./service-worker');
  const respondWith = vi.fn();
  listeners.get('fetch')?.({
    request: { url: 'https://chat.subcult.tv/uploads/' + 'a'.repeat(32), method: 'GET', destination: 'image' },
    respondWith,
  });
  expect(respondWith).not.toHaveBeenCalled();
  expect(open).not.toHaveBeenCalled();
  let done: Promise<unknown> | undefined;
  listeners.get('activate')?.({
    waitUntil: (p: Promise<unknown>) => {
      done = p;
    },
  });
  await done;
  expect(remove).toHaveBeenCalledOnce();
  expect(remove.mock.calls[0]?.[0]).toBeInstanceOf(Request);
});

it('returns opaque images from the network without storing quota-padded responses', async () => {
  const listeners = new Map<string, (event: any) => void>(),
    put = vi.fn(),
    response = { ok: false, type: 'opaque', clone: vi.fn() },
    fetcher = vi.fn(async () => response);
  vi.stubGlobal('fetch', fetcher);
  vi.stubGlobal('caches', { open: async () => ({ match: async () => undefined, put, keys: async () => [] }) });
  vi.stubGlobal('self', {
    location: { origin: 'https://chat.subcult.tv' },
    addEventListener: (name: string, handler: (event: any) => void) => listeners.set(name, handler),
  });
  await import('./service-worker');
  let result: Promise<unknown> | undefined;
  listeners.get('fetch')!({
    request: { url: 'https://cdn.example.com/emote.png', method: 'GET', destination: 'image' },
    respondWith: (p: Promise<unknown>) => {
      result = p;
    },
  });
  expect(await result).toBe(response);
  expect(fetcher).toHaveBeenCalledOnce();
  expect(put).not.toHaveBeenCalled();
});
it('prunes legacy opaque image and font entries without clearing readable caches or private storage', async () => {
  const listeners = new Map<string, (event: any) => void>(),
    opaque = new Request('https://cdn.example.com/opaque'),
    readable = new Request('https://cdn.example.com/readable'),
    remove = vi.fn(async (_request: Request) => true),
    deleteBucket = vi.fn();
  vi.stubGlobal('caches', {
    keys: async () => ['chatthing-images-v1', 'chatthing-fonts-v1', 'chatthing-shell-v1'],
    delete: deleteBucket,
    open: async () => ({
      keys: async () => [opaque, readable],
      match: async (r: Request) => ({ type: r === opaque ? 'opaque' : 'cors' }),
      delete: remove,
    }),
  });
  vi.stubGlobal('self', {
    location: { origin: 'https://chat.subcult.tv' },
    clients: { claim: vi.fn(async () => {}) },
    addEventListener: (name: string, handler: (event: any) => void) => listeners.set(name, handler),
  });
  await import('./service-worker');
  let done: Promise<unknown> | undefined;
  listeners.get('activate')!({
    waitUntil: (p: Promise<unknown>) => {
      done = p;
    },
  });
  await done;
  expect(remove.mock.calls.map((c) => c[0])).toEqual([opaque, opaque]);
  expect(deleteBucket).not.toHaveBeenCalled();
});

it('precaches an unopened lazy panel and serves it when the network is offline', async () => {
  const listeners = new Map<string, (event: any) => void>();
  const saved = new Map<string, Response>();
  const fetcher = vi.fn(async (request: RequestInfo) => {
    const path = typeof request === 'string' ? request : request.url;
    if (path === '/') return new Response('<script src="/assets/main.js"></script>');
    if (path === '/asset-manifest.json')
      return Response.json({
        main: { file: 'assets/main.js' },
        panel: { file: 'assets/lazy-panel.js', isDynamicEntry: true },
      });
    return new Response('lazy panel fixture');
  });
  vi.stubGlobal('fetch', fetcher);
  vi.stubGlobal('caches', {
    open: async () => ({
      put: async (key: string, response: Response) => {
        saved.set(key, response);
      },
      addAll: async (keys: string[]) => {
        for (const key of keys) saved.set(key, await fetcher(key));
      },
      match: async (key: string) => saved.get(new URL(key, 'https://chat.subcult.tv').pathname)?.clone(),
    }),
  });
  vi.stubGlobal('self', {
    location: { origin: 'https://chat.subcult.tv' },
    addEventListener: (name: string, handler: (event: any) => void) => listeners.set(name, handler),
  });
  await import('./service-worker');
  let installation: Promise<unknown> | undefined;
  listeners.get('install')!({
    waitUntil: (promise: Promise<unknown>) => {
      installation = promise;
    },
  });
  await installation;
  expect(saved.has('/assets/lazy-panel.js')).toBe(true);
  for (const path of REFERENCE_ASSETS) expect(saved.has(path)).toBe(true);
  fetcher.mockRejectedValue(new TypeError('offline'));
  let response: Promise<Response> | undefined;
  listeners.get('fetch')!({
    request: new Request('https://chat.subcult.tv/assets/lazy-panel.js'),
    respondWith: (promise: Promise<Response>) => {
      response = promise;
    },
  });
  expect(await (await response)!.text()).toBe('lazy panel fixture');
  for (const path of REFERENCE_ASSETS) {
    listeners.get('fetch')!({
      request: new Request('https://chat.subcult.tv' + path),
      respondWith: (promise: Promise<Response>) => {
        response = promise;
      },
    });
    expect(await (await response)!.text()).toBe('lazy panel fixture');
  }
});

it('keeps the previous offline shell when precaching a required build chunk fails', async () => {
  const listeners = new Map<string, (event: any) => void>();
  const put = vi.fn();
  vi.stubGlobal('caches', {
    open: async () => ({
      put,
      addAll: async () => {
        throw new Error('chunk unavailable');
      },
    }),
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url === '/asset-manifest.json'
        ? Response.json({ panel: { file: 'assets/lazy.js' } })
        : new Response('<html>new shell</html>'),
    ),
  );
  vi.stubGlobal('self', {
    addEventListener: (name: string, handler: (event: any) => void) => listeners.set(name, handler),
  });
  await import('./service-worker');
  let installation: Promise<unknown> | undefined;
  listeners.get('install')!({
    waitUntil: (promise: Promise<unknown>) => {
      installation = promise;
    },
  });
  await expect(installation).rejects.toThrow('chunk unavailable');
  expect(put).not.toHaveBeenCalled();
});

it('retains every installed chunk when a lazy build exceeds 64 shell entries', async () => {
  const origin = 'https://chat.subcult.tv';
  const listeners = new Map<string, (event: any) => void>();
  const manifest = Object.fromEntries(
    Array.from({ length: 70 }, (_, i) => ['part' + i, { file: 'assets/part' + i + '.js' }]),
  );
  const saved = new Map<string, Response>();
  const path = (value: RequestInfo) => new URL(typeof value === 'string' ? value : value.url, origin).pathname;
  const fetcher = vi.fn(async (request: RequestInfo) => {
    const key = path(request);
    if (key === '/') return new Response('<script src="/assets/part0.js"></script>');
    if (key === '/asset-manifest.json') return Response.json(manifest);
    return new Response(key);
  });
  const cache = {
    put: async (key: RequestInfo, value: Response) => {
      saved.set(path(key), value);
    },
    addAll: async (keys: string[]) => {
      for (const key of keys) saved.set(key, await fetcher(key));
    },
    match: async (key: RequestInfo) => saved.get(path(key))?.clone(),
    keys: async () => [...saved.keys()].map((key) => new Request(origin + key)),
    delete: async (key: RequestInfo) => saved.delete(path(key)),
  };
  vi.stubGlobal('fetch', fetcher);
  vi.stubGlobal('caches', { open: async () => cache });
  vi.stubGlobal('self', {
    location: { origin },
    addEventListener: (name: string, handler: (event: any) => void) => listeners.set(name, handler),
  });
  await import('./service-worker');
  let pending!: Promise<unknown>;
  listeners.get('install')!({
    waitUntil: (value: Promise<unknown>) => {
      pending = value;
    },
  });
  await pending;
  saved.set('/assets/obsolete.js', new Response('old'));
  saved.set('/data/obsolete.json', new Response('old'));
  listeners.get('fetch')!({
    request: new Request(origin + '/assets/part69.js'),
    respondWith: (value: Promise<unknown>) => {
      pending = value;
    },
  });
  await pending;
  expect(saved.has('/assets/obsolete.js')).toBe(false);
  expect(saved.has('/data/obsolete.json')).toBe(false);
  for (const path of REFERENCE_ASSETS) expect(saved.has(path)).toBe(true);
  for (let i = 0; i < 70; i++) expect(saved.has('/assets/part' + i + '.js')).toBe(true);
  expect(saved.has('/')).toBe(true);
  fetcher.mockRejectedValue(new TypeError('offline'));
  let response!: Promise<Response>;
  listeners.get('fetch')!({
    request: new Request(origin + '/assets/part0.js'),
    respondWith: (value: Promise<Response>) => {
      response = value;
    },
  });
  expect(await (await response).text()).toBe('/assets/part0.js');
});
