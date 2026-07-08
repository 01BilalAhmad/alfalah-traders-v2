const CACHE_NAME = 'finexa-v1';
const STATIC_ASSETS = [
  '/',
  '/icon-192.png',
  '/icon-512.png',
  '/logo.svg',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch event - Network first, fallback to cache
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension and other non-http requests
  if (!url.protocol.startsWith('http')) return;

  // API requests: Network first, cache on success
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful API responses for offline use
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Return cached API response when offline
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              // Return cached response with a custom header so the app knows it's offline data
              const headers = new Headers(cachedResponse.headers);
              headers.set('X-Offline-Cache', 'true');
              return new Response(cachedResponse.body, {
                status: cachedResponse.status,
                statusText: cachedResponse.statusText,
                headers,
              });
            }
            // Return a minimal offline response for API calls
            return new Response(
              JSON.stringify({ error: 'You are offline. Please check your internet connection.', offline: true }),
              { status: 503, headers: { 'Content-Type': 'application/json' } }
            );
          });
        })
    );
    return;
  }

  // Static assets (JS, CSS, images): Cache first, network fallback
  if (
    url.pathname.startsWith('/_next/') ||
    url.pathname.startsWith('/icon-') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.woff')
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        }).catch(() => {
          // Return offline fallback for images
          if (request.destination === 'image') {
            return new Response(
              '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect fill="#f1f5f9" width="48" height="48" rx="4"/><text x="24" y="28" text-anchor="middle" font-size="10" fill="#94a3b8">Offline</text></svg>',
              { headers: { 'Content-Type': 'image/svg+xml' } }
            );
          }
        });
      })
    );
    return;
  }

  // HTML pages: Network first, cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(request).then((cached) => {
          return cached || caches.match('/');
        });
      })
  );
});

// Background sync for offline recovery posting
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-recoveries') {
    event.waitUntil(syncOfflineRecoveries());
  }
  if (event.tag === 'sync-credits') {
    event.waitUntil(syncOfflineCredits());
  }
});

async function syncOfflineRecoveries() {
  try {
    const db = await openIndexedDB();
    const tx = db.transaction('offline-recoveries', 'readwrite');
    const store = tx.objectStore('offline-recoveries');
    const all = await store.getAll();

    for (const item of all) {
      try {
        const res = await fetch('/api/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.data),
        });
        if (res.ok) {
          await store.delete(item.id);
        }
      } catch {
        // Will retry on next sync
      }
    }
    db.close();
  } catch {
    // IndexedDB not available
  }
}

async function syncOfflineCredits() {
  try {
    const db = await openIndexedDB();
    const tx = db.transaction('offline-credits', 'readwrite');
    const store = tx.objectStore('offline-credits');
    const all = await store.getAll();

    for (const item of all) {
      try {
        const res = await fetch('/api/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.data),
        });
        if (res.ok) {
          await store.delete(item.id);
        }
      } catch {
        // Will retry on next sync
      }
    }
    db.close();
  } catch {
    // IndexedDB not available
  }
}

function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('finexa-offline', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('offline-recoveries')) {
        db.createObjectStore('offline-recoveries', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('offline-credits')) {
        db.createObjectStore('offline-credits', { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
