const STATIC_CACHE = "factory-dashboard-static-v3";
const API_CACHE = "factory-dashboard-api-v3";
const PAGE_CACHE = "factory-dashboard-pages-v3";

const OFFLINE_FALLBACK = "/offline.html";
const STATIC_ASSETS = ["/", "/offline.html", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter(
            (key) =>
              key !== STATIC_CACHE && key !== API_CACHE && key !== PAGE_CACHE,
          )
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/backend/")
  ) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  const isRscRequest =
    request.headers.get("RSC") === "1" ||
    request.headers.get("Next-Router-Prefetch") === "1" ||
    request.headers.get("Next-Router-State-Tree") != null;

  if (
    url.pathname.startsWith("/_next/") ||
    url.pathname.startsWith("/fonts/") ||
    isRscRequest
  ) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }

  event.respondWith(staleWhileRevalidate(request, PAGE_CACHE));
});

self.addEventListener("sync", (event) => {
  if (event.tag === "dashboard-offline-sync") {
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) =>
          client.postMessage({
            type: "SYNC_REQUESTED",
            tag: event.tag,
          }),
        );
      }),
    );
  }
});

async function handleNavigation(request) {
  const cache = await caches.open(PAGE_CACHE);

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;

    const offlinePage = await caches.match(OFFLINE_FALLBACK);
    if (offlinePage) return offlinePage;

    const shell = await caches.match("/");
    return shell || new Response("Offline", { status: 503 });
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (
      caches.match(OFFLINE_FALLBACK) || new Response("Offline", { status: 503 })
    );
  }
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return (
      cached ||
      new Response(JSON.stringify({ success: false, message: "Offline" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      })
    );
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cached = await caches.match(request);
  const network = fetch(request)
    .then(async (response) => {
      if (response.ok) {
        const cache = await caches.open(cacheName);
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(async () => cached);

  if (cached) return cached;
  return network;
}
