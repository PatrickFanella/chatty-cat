/// <reference lib="webworker" />
export {};
const worker = self as unknown as ServiceWorkerGlobalScope;
const SHELL = 'chatthing-shell-v1'; const IMAGES = 'chatthing-images-v1'; const FONTS = 'chatthing-fonts-v1';
const KEEP = new Set([SHELL, IMAGES, FONTS]);
async function trim(cache: Cache, cap: number): Promise<void> { const keys = await cache.keys(); for (const key of keys.slice(0, Math.max(0, keys.length - cap))) await cache.delete(key); }
async function put(cache: Cache, key: RequestInfo, response: Response, cap: number): Promise<void> { try { await cache.put(key, response); await trim(cache, cap); } catch { /* Cache quota denial must not prevent the network response. */ } }
worker.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL); const response = await fetch('/', { cache: 'reload' }); if (!response.ok) throw new Error('Shell unavailable');
    const html = await response.clone().text(); await cache.put('/', response);
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"\s]+)"/g)].flatMap(match => match[1] ? [match[1]] : []);
    await cache.addAll([...new Set([...assets, '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png', '/apple-touch-icon.png', '/favicon.ico', '/favicon.svg', '/mark-themed.svg'])]);
  })());
});
worker.addEventListener('activate', event => {
  event.waitUntil((async () => { for (const name of await caches.keys()) if (name.startsWith('chatthing-') && !KEEP.has(name)) await caches.delete(name); const images=await caches.open(IMAGES);for(const request of await images.keys()){const host=new URL(request.url).hostname;if(host==='giphy.com'||host.endsWith('.giphy.com')||new URL(request.url).origin===worker.location.origin&&new URL(request.url).pathname.startsWith('/uploads/'))await images.delete(request);}
    await worker.clients.claim(); })());
});
worker.addEventListener('message', event => { if (event.data === 'activate-update') void worker.skipWaiting(); });
async function shell(request: Request): Promise<Response> {
  const cache = await caches.open(SHELL); const url = new URL(request.url); const key = url.origin + url.pathname;
  try { const response = await fetch(request); if (response.ok) await put(cache, key, response.clone(), 64); return response; }
  catch (error) { const cached = await cache.match(request.mode === 'navigate' ? '/' : key); if (cached) return cached; throw error; }
}
async function cachedAsset(request: Request, bucket: string, cap: number): Promise<Response> {
  const cache = await caches.open(bucket); const hit = await cache.match(request); if (hit) return hit;
  const response = await fetch(request); if (response.ok || response.type === 'opaque') await put(cache, request, response.clone(), cap); return response;
}
worker.addEventListener('fetch', event => {
  const request = event.request; const url = new URL(request.url); if (request.method !== 'GET' || !['https:', 'http:'].includes(url.protocol)) return;
  // Login, chat, provider data and third-party embeds always use the network.
  if (url.origin === worker.location.origin && (url.pathname.startsWith('/api/')||url.pathname.startsWith('/uploads/'))) return;
  if(url.hostname==='giphy.com'||url.hostname.endsWith('.giphy.com'))return;
  if (request.destination === 'image') { event.respondWith(cachedAsset(request, IMAGES, 600)); return; }
  if (request.destination === 'font' || url.hostname === 'fonts.googleapis.com') { event.respondWith(cachedAsset(request, FONTS, 100)); return; }
  if (url.origin === worker.location.origin && (request.mode === 'navigate' || url.pathname.startsWith('/assets/') || ['/manifest.webmanifest', '/favicon.ico'].includes(url.pathname))) event.respondWith(shell(request));
});

worker.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const clients = await worker.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = clients.find(client => new URL(client.url).origin === worker.location.origin);
    if (existing) { await existing.focus(); return; }
    const channel: unknown = event.notification.data?.channel;
    await worker.clients.openWindow(typeof channel === 'string' && /^[a-z0-9_]{1,25}$/.test(channel) ? '/?channel=' + channel : '/');
  })());
});
