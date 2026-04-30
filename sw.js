const STATIC_CACHE = "dlk-dashboard-static-v10";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./championnat.html",
  "./championnat.js",
  "./championnat-salle.html",
  "./Dchampionnat.html",
  "./Dchampionnat.js",
  "./dashboard-nav-bubble.js",
  "./secure-functions.js",
  "./Dclient-review.html",
  "./Dclient-review.js",
  "./Dagentwithdrawal.html",
  "./Dagentwithdrawal.js",
  "./Dhero.html",
  "./Dhero.js",
  "./site.webmanifest",
  "./favicon.ico",
  "./favicon-96x96.png",
  "./apple-touch-icon.png",
  "./web-app-manifest-192x192.png",
  "./web-app-manifest-512x512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key !== STATIC_CACHE)
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

async function networkFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (_) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw _;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const destination = request.destination;
  if (
    request.mode === "navigate" ||
    destination === "script" ||
    destination === "style" ||
    destination === "document"
  ) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (destination === "image" || destination === "font") {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.ok) {
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, response.clone())).catch(() => {});
          }
          return response;
        });
      })
    );
  }
});

self.addEventListener("push", (event) => {
  const payload = (() => {
    try {
      return event.data?.json() || {};
    } catch (_) {
      return {};
    }
  })();

  const title = String(payload.title || "Dashboard Dominoes Lakay");
  const deliveredAtIso = new Date().toISOString();
  const pushCreatedAt = String(payload.createdAt || "");
  const sourceCreatedAt = String(payload.sourceCreatedAt || "");
  const deliveryLagMs = pushCreatedAt ? Math.max(0, Date.now() - Date.parse(pushCreatedAt)) : null;
  const endToEndLagMs = sourceCreatedAt ? Math.max(0, Date.now() - Date.parse(sourceCreatedAt)) : null;
  console.info("[DASHBOARD_PUSH][SW] push reçu", {
    type: String(payload.type || ""),
    entityId: String(payload.entityId || ""),
    tag: String(payload.tag || ""),
    pushCreatedAt,
    sourceCreatedAt,
    deliveredAt: deliveredAtIso,
    deliveryLagMs,
    endToEndLagMs,
  });
  const options = {
    body: String(payload.body || ""),
    icon: "./apple-touch-icon.png",
    badge: "./favicon-96x96.png",
    tag: String(payload.tag || `dashboard_push_${Date.now()}`),
    data: {
      url: String(payload.url || "./Dpayment.html"),
      entityId: String(payload.entityId || ""),
      type: String(payload.type || ""),
      createdAt: String(payload.createdAt || ""),
      sourceCreatedAt,
    },
    renotify: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = String(event.notification.data?.url || "./Dpayment.html");

  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clientList) {
      if ("focus" in client) {
        await client.focus();
        if ("navigate" in client) {
          await client.navigate(targetUrl).catch(() => {});
        }
        return;
      }
    }
    await self.clients.openWindow(targetUrl);
  })());
});
