const APP_SCOPE = new URL(self.registration.scope);
const CACHE_PREFIX = `cute-go:${encodeURIComponent(APP_SCOPE.pathname)}:`;
const CACHE_NAME = `${CACHE_PREFIX}v5`;
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './logo.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

async function storeResponse(cache, request, response) {
  if (!response.ok) return;
  try {
    await cache.put(request, response.clone());
  } catch {
    // Cache quota or unsupported responses must not break an online game.
  }
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    // Revalidate stable model/WASM URLs instead of reusing an HTTP cache entry.
    const response = await fetch(request, { cache: 'no-cache' });
    if (response.ok) {
      await storeResponse(cache, request, response);
      return response;
    }
    return (await cache.match(request)) || response;
  } catch (error) {
    // Matching preserves the query string, including the ORT runtime version.
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  await storeResponse(cache, request, response);
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // Leave unrelated applications, remote resources and writes to the browser.
  if (request.method !== 'GET' || url.origin !== APP_SCOPE.origin || !url.pathname.startsWith(APP_SCOPE.pathname)) return;

  const relativePath = url.pathname.slice(APP_SCOPE.pathname.length);
  const mutableAsset = relativePath.startsWith('models/') || relativePath.startsWith('wasm/');
  const documentRequest = request.mode === 'navigate' || request.destination === 'document';
  event.respondWith(documentRequest || mutableAsset ? networkFirst(request) : cacheFirst(request));
});

async function migrateCaches() {
  const currentCache = await caches.open(CACHE_NAME);
  for (const name of await caches.keys()) {
    const ownOldCache = name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME;
    // The previous worker was registered at the origin root only.
    const legacyRootCache = APP_SCOPE.pathname === '/' && /^cute-go-v\d+$/.test(name);
    if (!ownOldCache && !legacyRootCache) continue;

    // Preserve cached bundles and inference files for offline upgrades. Keep the
    // exact request URL: unversioned/old-version WASM cannot satisfy a new one.
    const previousCache = await caches.open(name);
    for (const request of await previousCache.keys()) {
      const url = new URL(request.url);
      if (url.origin !== APP_SCOPE.origin || !url.pathname.startsWith(APP_SCOPE.pathname)) continue;
      const path = url.pathname.slice(APP_SCOPE.pathname.length);
      if (!/^(assets|models|wasm)\//.test(path) || await currentCache.match(request)) continue;
      const response = await previousCache.match(request);
      if (response) await storeResponse(currentCache, request, response);
    }
    await caches.delete(name);
  }
  await self.clients.claim();
}

self.addEventListener('activate', (event) => {
  event.waitUntil(migrateCaches());
});

