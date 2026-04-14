// Zaltyko Service Worker - Enhanced PWA Support
const CACHE_NAME = 'zaltyko-v1';
const STATIC_CACHE = 'zaltyko-static-v1';
const DYNAMIC_CACHE = 'zaltyko-dynamic-v1';
const API_CACHE = 'zaltyko-api-v1';
const OFFLINE_URL = '/offline.html';

// IndexedDB helper functions (inline for service worker)
const DB_NAME = 'zaltyko-offline';
const DB_VERSION = 1;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(new Error('Failed to open IndexedDB'));
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('pendingOperations')) {
        db.createObjectStore('pendingOperations', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('cachedData')) {
        db.createObjectStore('cachedData', { keyPath: 'key' });
      }
    };

    resolve(request.result);
  });
}

function getAllFromStore(db, storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function deleteFromStore(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Static assets to cache immediately
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/offline.html',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== DYNAMIC_CACHE && key !== API_CACHE)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch event - implement caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip chrome extensions and other non-http(s) requests
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // API requests - Network first with cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstWithCache(request, API_CACHE));
    return;
  }

  // Static assets - Cache first with network fallback
  if (
    url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/) ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/_next/static/')
  ) {
    event.respondWith(cacheFirstWithNetwork(request, STATIC_CACHE));
    return;
  }

  // HTML pages - Network first with cache fallback
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(networkFirstWithCache(request, DYNAMIC_CACHE).catch(() => {
      // Return offline page if network fails and no cache
      return caches.match(OFFLINE_URL).then(offlineResponse => {
        if (offlineResponse) return offlineResponse;
        // Last resort: return a simple offline response
        return new Response(
          '<html><body><h1>Sin conexión</h1><p>No se pudo cargar la página.</p></body></html>',
          { headers: { 'Content-Type': 'text/html' } }
        );
      });
    }));
    return;
  }

  // Default - Network only
  event.respondWith(fetch(request));
});

// Cache first strategy - check cache, then network
async function cacheFirstWithNetwork(request, cacheName) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    return new Response('Offline', { status: 503 });
  }
}

// Network first strategy - try network, fallback to cache
async function networkFirstWithCache(request, cacheName) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    return new Response('Offline - No cached version available', { status: 503 });
  }
}

// Push notification event
self.addEventListener('push', (event) => {
  let data = { title: 'Zaltyko', body: 'Nueva notificación' };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    vibrate: [100, 50, 100],
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
    renotify: data.renotify || true,
    requireInteraction: data.requireInteraction || false,
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if there's already a window open
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(urlToOpen);
          return client.focus();
        }
      }
      // Open new window if none exists
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// Background sync for offline operations
self.addEventListener('sync', (event) => {
  if (event.tag === 'pending-operations' || event.tag === 'sync-pending-operations') {
    event.waitUntil(syncPendingOperations());
  }
});

async function syncPendingOperations() {
  try {
    const db = await openDatabase();
    const operations = await getAllFromStore(db, 'pendingOperations');

    if (!operations || operations.length === 0) {
      console.log('No pending operations to sync');
      return;
    }

    console.log(`Syncing ${operations.length} pending operations`);

    for (const operation of operations) {
      const result = await executeOperation(operation);

      if (result.success) {
        await deleteFromStore(db, 'pendingOperations', operation.id);
        console.log(`Synced operation ${operation.id}`);
      } else {
        console.error(`Failed to sync operation ${operation.id}:`, result.error);
      }
    }
  } catch (error) {
    console.error('Background sync failed:', error);
  }
}

async function executeOperation(operation) {
  const endpointMap = {
    'athlete:create': { endpoint: '/api/athletes', method: 'POST' },
    'athlete:update': { endpoint: `/api/athletes/${operation.payload?.id}`, method: 'PATCH' },
    'athlete:delete': { endpoint: `/api/athletes/${operation.payload?.id}`, method: 'DELETE' },
    'enrollment:create': { endpoint: '/api/enrollments', method: 'POST' },
    'enrollment:cancel': { endpoint: `/api/enrollments/${operation.payload?.id}`, method: 'DELETE' },
    'class:update': { endpoint: `/api/classes/${operation.payload?.id}`, method: 'PATCH' },
    'attendance:mark': { endpoint: '/api/attendance', method: 'POST' },
    'payment:record': { endpoint: '/api/payments', method: 'POST' },
  };

  const config = endpointMap[operation.type];
  if (!config) {
    return { success: false, error: `Unknown operation type: ${operation.type}` };
  }

  try {
    const response = await fetch(config.endpoint, {
      method: config.method,
      headers: { 'Content-Type': 'application/json' },
      body: config.method !== 'DELETE' ? JSON.stringify(operation.payload) : undefined,
    });

    return { success: response.ok, error: response.ok ? null : `HTTP ${response.status}` };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Message handler for cache management
self.addEventListener('message', (event) => {
  if (event.data && event.data.type) {
    switch (event.data.type) {
      case 'SKIP_WAITING':
        self.skipWaiting();
        break;
      case 'CLEAR_CACHE':
        event.waitUntil(clearAllCaches());
        break;
      case 'GET_VERSION':
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ version: CACHE_NAME });
        } else {
          event.source.postMessage({ version: CACHE_NAME });
        }
        break;
      case 'GET_PENDING_COUNT':
        openDatabase().then(db => {
          return getAllFromStore(db, 'pendingOperations');
        }).then(operations => {
          if (event.ports && event.ports[0]) {
            event.ports[0].postMessage({ pendingCount: operations.length });
          } else {
            event.source.postMessage({ pendingCount: operations.length });
          }
        }).catch(() => {
          if (event.ports && event.ports[0]) {
            event.ports[0].postMessage({ pendingCount: 0 });
          } else {
            event.source.postMessage({ pendingCount: 0 });
          }
        });
        break;
    }
  }
});

async function clearAllCaches() {
  const keys = await caches.keys();
  return Promise.all(keys.map((key) => caches.delete(key)));
}

// Periodic background sync (if supported)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'update-content') {
    event.waitUntil(updateContent());
  }
});

// Notify clients of pending operation count
async function notifyPendingCount() {
  try {
    const db = await openDatabase();
    const operations = await getAllFromStore(db, 'pendingOperations');
    const clientCount = await clients.matchAll();

    for (const client of clientCount) {
      client.postMessage({
        type: 'PENDING_OPERATIONS',
        count: operations.length,
      });
    }
  } catch (e) {
    // Ignore errors in notification
  }
}

async function updateContent() {
  // Pre-cache important pages for offline access
  const importantPages = ['/', '/dashboard'];
  const cache = await caches.open(DYNAMIC_CACHE);

  for (const page of importantPages) {
    try {
      await fetch(page, { mode: 'navigate' });
    } catch (e) {
      console.log('Failed to pre-cache:', page);
    }
  }
}
