// Zaltyko Service Worker - safe static caching + push notifications.
// Private HTML and API responses are deliberately never cached.
const CACHE_NAME = 'zaltyko-static-v3';
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

  // Next owns its RSC and prefetch transport. Leave these requests untouched
  // so browser navigation and router refresh are not wrapped by this worker.
  if (request.headers.get('RSC') === '1' || url.searchParams.has('_rsc')) {
    return;
  }

  // Tenant/user data must always come from the network. Do not call
  // respondWith here: the browser performs the request natively. Wrapping it
  // in a pass-through respondWith only turned aborted or offline requests
  // into "FetchEvent ... network error" plus "Uncaught (in promise)" errors.
  if (url.pathname.startsWith('/api/')) {
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

  // Other dynamic GETs (e.g. router fetches of /app/<id>/athletes) are left
  // to the browser as well; a pass-through adds nothing and rejects on abort.
  if (!isSafeStaticAsset) {
    return;
  }

  event.respondWith(
    (async () => {
      let cachedResponse;
      try {
        cachedResponse = await caches.match(request);
      } catch {
        cachedResponse = undefined;
      }
      if (cachedResponse) return cachedResponse;

      let networkResponse;
      try {
        networkResponse = await fetch(request);
      } catch {
        // Offline or aborted and nothing cached: report a plain network error
        // instead of leaving a rejected promise unhandled in the worker.
        return Response.error();
      }
      if (networkResponse.ok && networkResponse.type === 'basic') {
        try {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, networkResponse.clone());
        } catch {
          // A full or unavailable cache must not break the response.
        }
      }
      return networkResponse;
    })()
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
