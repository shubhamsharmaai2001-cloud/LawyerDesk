// Service Worker for LawyerDesk PWA
const CACHE_NAME = 'lawyerdesk-v3';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/pwa-icon-192.png',
  '/pwa-icon-512.png',
  '/pwa-icon-1024.png',
  '/screenshot-desktop.png',
  '/screenshot-mobile.png'
];

// Install Event - Pre-cache core app shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching offline app shell');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate Event - Clean up stale caches and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event - Network First with Cache Fallback for dynamic offline usage
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Ignore chrome-extension or external analytics
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Cache successful HTTP responses for offline re-use
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Fallback to cache when offline
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Default offline fallback for html navigation
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html') || caches.match('/');
          }
        });
      })
  );
});

// Background Sync for offline case updates
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-legal-cases') {
    console.log('[Service Worker] Background sync triggered for legal cases');
  }
});

// Periodic Background Sync handler for automated daily cause list & data updates
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'update-legal-causelist' || event.tag === 'daily-cause-list') {
    console.log('[Service Worker] Periodic background sync triggered:', event.tag);
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => {
        return fetch('/api/widgets/causelist')
          .then((response) => {
            if (response && response.ok) {
              return cache.put('/api/widgets/causelist', response);
            }
          })
          .catch((err) => console.log('[Service Worker] Periodic sync fetch error:', err));
      })
    );
  }
});

// Push Notification handler
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.text() : 'Upcoming Court Hearing Reminder';
  event.waitUntil(
    self.registration.showNotification('LawyerDesk Alert', {
      body: data,
      icon: '/pwa-icon-192.png',
      badge: '/icon.svg',
      data: { url: '/' }
    })
  );
});

// Notification Click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});
