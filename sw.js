const CACHE_NAME = "kobposh-dashboard-v2-pwa-v1";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./site.webmanifest",
  "./apple-touch-icon.png",
  "./favicon.ico",
  "./favicon.svg",
  "./favicon-96x96.png",
  "./web-app-manifest-192x192.png",
  "./web-app-manifest-512x512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => null)
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => {
      if (key !== CACHE_NAME) return caches.delete(key);
      return null;
    }));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        cache.put("./index.html", fresh.clone()).catch(() => null);
        return fresh;
      } catch (_) {
        const cached = await caches.match(request);
        return cached || caches.match("./index.html");
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const fresh = await fetch(request);
      if (fresh && fresh.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, fresh.clone()).catch(() => null);
      }
      return fresh;
    } catch (_) {
      return cached;
    }
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = String(event.notification?.data?.url || "./index.html");
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of allClients) {
      const clientUrl = new URL(client.url);
      const resolvedTarget = new URL(targetUrl, self.location.origin);
      if (clientUrl.pathname === resolvedTarget.pathname) {
        await client.focus();
        return;
      }
    }
    await self.clients.openWindow(targetUrl);
  })());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = {};
  }
  const title = String(payload.title || "Kobposh Dashboard");
  const options = {
    body: String(payload.body || "Nouvelle alerte dashboard."),
    icon: String(payload.icon || "./apple-touch-icon.png"),
    badge: String(payload.badge || "./favicon-96x96.png"),
    tag: String(payload.tag || "dashboard_push"),
    data: {
      url: String(payload.url || "./index.html"),
    },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
