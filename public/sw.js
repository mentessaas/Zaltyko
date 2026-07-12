// Zaltyko Service Worker - safe static caching + push notifications.
// Private HTML and API responses are deliberately never cached.
const CACHE_NAME = 'zaltyko-static-v2';
const OFFLINE_URL = '/offline.html';

const STATIC_ASSETS = [
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  OFFLINE_URL,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  // Tenant/user data must always come from the network.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  // Never persist authenticated or personalized HTML. Offline navigation gets
  // a static information page, not a potentially stale page from another user.
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request).catch(async () => {
        const offlineResponse = await caches.match(OFFLINE_URL);
        return offlineResponse ?? new Response('Sin conexión', { status: 503 });
      })
    );
    return;
  }

  const isSafeStaticAsset =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.json' ||
    /\.(?:css|js|png|jpg|jpeg|gif|svg|ico|woff2?)$/.test(url.pathname);

  if (!isSafeStaticAsset) {
    event.respondWith(fetch(request));
    return;
  }

  event.respondWith(
    caches.match(request).then(async (cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      const networkResponse = await fetch(request);
      if (networkResponse.ok && networkResponse.type === 'basic') {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
  );
});

self.addEventListener('push', (event) => {
  let data = { title: 'Zaltyko', body: 'Nueva notificación' };

  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    data: {
      url: data.url || '/',
      dateOfArrival: Date.now(),
      primaryKey: data.id || '1',
    },
    actions: [
      { action: 'view', title: 'Ver' },
      { action: 'dismiss', title: 'Cerrar' },
    ],
    tag: data.tag || 'zaltyko-notification',
    renotify: data.renotify ?? true,
    requireInteraction: data.requireInteraction ?? false,
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const requestedUrl = event.notification.data?.url || '/';
  const safeUrl = new URL(requestedUrl, self.location.origin);
  const urlToOpen = safeUrl.origin === self.location.origin ? safeUrl.href : self.location.origin;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.navigate(urlToOpen);
          return client.focus();
        }
      }
      return clients.openWindow ? clients.openWindow(urlToOpen) : undefined;
    })
  );
});

self.addEventListener('message', (event) => {
  if (!event.data?.type) return;

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
    );
    return;
  }

  if (event.data.type === 'GET_VERSION') {
    const target = event.ports?.[0] ?? event.source;
    target?.postMessage({ version: CACHE_NAME });
  }
});
