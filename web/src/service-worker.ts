/// <reference lib="webworker" />
import { precacheAssets } from './precache-assets';
import { REFERENCE_ASSETS } from './reference-assets';
export {};
const worker = self as unknown as ServiceWorkerGlobalScope;
const SHELL = 'chatthing-shell-v1';
const IMAGES = 'chatthing-images-v1';
const FONTS = 'chatthing-fonts-v1';
const EMOJI = 'chatthing-emoji-17-v1';
const KEEP = new Set([SHELL, IMAGES, FONTS, EMOJI]);
async function trim(cache: Cache, cap: number): Promise<void> {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - cap))) await cache.delete(key);
}
async function put(cache: Cache, key: RequestInfo, response: Response, cap: number): Promise<void> {
  try {
    await cache.put(key, response);
    await trim(cache, cap);
  } catch {
    /* Cache quota denial must not prevent the network response. */
  }
}
async function putShell(cache: Cache, key: string, response: Response): Promise<void> {
  try {
    await cache.put(key, response);
    const manifest = await cache.match('/asset-manifest.json');
    // A complete lazy build can exceed the old 64-entry limit. Never evict
    // installed build chunks, its shell or icons to make room for runtime reads.
    if (!manifest) return;
    const protectedPaths = new Set([...precacheAssets(await manifest.json()), ...REFERENCE_ASSETS]);
    const keys = await cache.keys();
    const removable = keys.filter((request) => {
      const path = new URL(request.url).pathname;
      return (path.startsWith('/assets/') || path.startsWith('/data/')) && !protectedPaths.has(path);
    });
    const protectedCount = keys.length - removable.length;
    const excess = keys.length - Math.max(64, protectedCount);
    for (const request of removable.slice(0, Math.max(0, excess))) await cache.delete(request);
  } catch {
    /* Optional cache writes must not prevent the network response. */
  }
}
worker.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      const response = await fetch('/', { cache: 'reload' });
      if (!response.ok) throw new Error('Shell unavailable');
      const manifest = await fetch('/asset-manifest.json', { cache: 'reload' });
      if (!manifest.ok) throw new Error('Build manifest unavailable');
      const manifestData: unknown = await manifest.json();
      const chunks = precacheAssets(manifestData);
      const html = await response.clone().text();
      const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"\s]+)"/g)].flatMap((match) =>
        match[1] ? [match[1]] : [],
      );
      await cache.addAll([
        ...new Set([
          ...assets,
          ...chunks,
          ...REFERENCE_ASSETS,
          '/manifest.webmanifest',
          '/icon-192.png',
          '/icon-512.png',
          '/icon-maskable-512.png',
          '/apple-touch-icon.png',
          '/favicon.ico',
          '/favicon.svg',
          '/mark-themed.svg',
        ]),
      ]);
      // Keep the previous offline shell if any new build chunk is unavailable.
      await cache.put('/', response);
      await cache.put('/asset-manifest.json', Response.json(manifestData));
    })(),
  );
});
worker.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys())
        if (name.startsWith('chatthing-') && !KEEP.has(name)) await caches.delete(name);
      // Opaque responses have padded quota costs (roughly 7 MiB each in Chromium).
      // Remove only regenerable asset entries; IndexedDB journals are untouched.
      for (const bucket of [IMAGES, FONTS]) {
        const cache = await caches.open(bucket);
        for (const request of await cache.keys()) {
          const url = new URL(request.url),
            response = await cache.match(request);
          if (
            response?.type === 'opaque' ||
            url.hostname === 'giphy.com' ||
            url.hostname.endsWith('.giphy.com') ||
            (url.origin === worker.location.origin && url.pathname.startsWith('/uploads/'))
          )
            await cache.delete(request);
        }
      }
      await worker.clients.claim();
    })(),
  );
});
worker.addEventListener('message', (event) => {
  if (event.data === 'activate-update') void worker.skipWaiting();
});
async function shell(request: Request): Promise<Response> {
  const cache = await caches.open(SHELL);
  const url = new URL(request.url);
  const key = url.origin + url.pathname;
  try {
    const response = await fetch(request);
    if (response.ok) await putShell(cache, key, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request.mode === 'navigate' ? '/' : key);
    if (cached) return cached;
    throw error;
  }
}
async function cachedAsset(request: Request, bucket: string, cap: number): Promise<Response> {
  const cache = await caches.open(bucket);
  const hit = await cache.match(request);
  if (hit && hit.type !== 'opaque') return hit;
  if (hit) await cache.delete(request);
  const response = await fetch(request);
  if (response.ok && response.type !== 'opaque') await put(cache, request, response.clone(), cap);
  return response;
}
worker.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || !['https:', 'http:'].includes(url.protocol)) return;
  // Login, chat, provider data and third-party embeds always use the network.
  if (
    url.origin === worker.location.origin &&
    (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/'))
  )
    return;
  if (url.hostname === 'giphy.com' || url.hostname.endsWith('.giphy.com')) return;
  if (url.origin === worker.location.origin && /^\/emoji\/twemoji-17\.0\.3\/[a-f0-9-]+\.svg$/.test(url.pathname)) {
    event.respondWith(cachedAsset(request, EMOJI, 128));
    return;
  }
  if (request.destination === 'image') {
    event.respondWith(cachedAsset(request, IMAGES, 600));
    return;
  }
  if (request.destination === 'font' || url.hostname === 'fonts.googleapis.com') {
    event.respondWith(cachedAsset(request, FONTS, 100));
    return;
  }
  if (
    url.origin === worker.location.origin &&
    (request.mode === 'navigate' ||
      url.pathname.startsWith('/assets/') ||
      REFERENCE_ASSETS.some((path) => path === url.pathname) ||
      ['/manifest.webmanifest', '/favicon.ico'].includes(url.pathname))
  )
    event.respondWith(shell(request));
});

worker.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const clients = await worker.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = clients.find((client) => new URL(client.url).origin === worker.location.origin);
      if (existing) {
        await existing.focus();
        return;
      }
      const channel: unknown = event.notification.data?.channel;
      await worker.clients.openWindow(
        typeof channel === 'string' && /^[a-z0-9_]{1,25}$/.test(channel) ? '/?channel=' + channel : '/',
      );
    })(),
  );
});
