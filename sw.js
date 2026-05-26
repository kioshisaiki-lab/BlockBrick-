// Block Brick Service Worker — offline support with progress reporting
const CACHE_NAME = 'blockbrick-v61';

const ALL_FILES = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

var cacheProgress = { done: 0, total: ALL_FILES.length, finished: false };

function broadcast(msg) {
  self.clients.matchAll({ includeUncontrolled: true }).then(function(clients) {
    clients.forEach(function(c) { c.postMessage(msg); });
  });
}

self.addEventListener('install', function(e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(async function(cache) {
      cacheProgress = { done: 0, total: ALL_FILES.length, finished: false };
      broadcast({ type: 'CACHE_START', total: ALL_FILES.length });

      for (var i = 0; i < ALL_FILES.length; i++) {
        try {
          var req = new Request(ALL_FILES[i], { cache: 'no-cache' });
          var resp = await fetch(req);
          await cache.put(req, resp);
        } catch(err) {}
        cacheProgress.done++;
        broadcast({ type: 'CACHE_PROGRESS', done: cacheProgress.done, total: cacheProgress.total });
      }

      cacheProgress.finished = true;
      broadcast({ type: 'CACHE_DONE' });
    })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

// Page can ask for current progress on load
self.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'GET_CACHE_STATUS') {
    e.source.postMessage({
      type: cacheProgress.finished ? 'CACHE_DONE' : 'CACHE_PROGRESS',
      done: cacheProgress.done,
      total: cacheProgress.total
    });
  }
});

self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // Only cache our own GitHub Pages files, not external (Google Drive music)
  if (!url.href.includes('kioshisaiki-lab.github.io')) return;

  e.respondWith(
    caches.open(CACHE_NAME).then(async function(cache) {
      const cached = await cache.match(e.request, { ignoreSearch: true });
      if (cached) return cached;

      try {
        const response = await fetch(e.request);
        cache.put(e.request, response.clone());
        return response;
      } catch (err) {
        if (url.pathname.endsWith('/') || url.pathname.endsWith('.html')) {
          return cache.match('./index.html');
        }
      }
    })
  );
});
