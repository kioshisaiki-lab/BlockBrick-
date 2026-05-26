// Block Brick Service Worker — always fetch fresh, no stale cache
const CACHE_NAME = 'blockbrick-v52';

self.addEventListener('install', function(e) {
  self.skipWaiting(); // activate immediately
});

self.addEventListener('activate', function(e) {
  // Delete all old caches
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim(); // take control of all open tabs
    })
  );
});

self.addEventListener('fetch', function(e) {
  // Always go to network first, fall back to cache
  e.respondWith(
    fetch(e.request).then(function(response) {
      // Cache a fresh copy
      var clone = response.clone();
      caches.open(CACHE_NAME).then(function(cache) {
        cache.put(e.request, clone);
      });
      return response;
    }).catch(function() {
      // Offline fallback — serve from cache
      return caches.match(e.request);
    })
  );
});
