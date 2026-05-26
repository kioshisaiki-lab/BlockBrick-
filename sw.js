// Block Brick Service Worker — offline support with progress reporting
const CACHE_NAME = 'blockbrick-v56';

const ALL_FILES = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './01_Kalapastangan.mp3',
  './02_Risk_It_All.mp3',
  './03_The_Man_Who_Cant_Be_Moved.mp3',
  './05_Lifetime.mp3',
  './06_Do_I_Wanna_Know.mp3',
  './07_Sagip.mp3',
  './08_Hirap_Kalimutan.mp3',
  './09_Tensionado.mp3',
  './10_Panata.mp3',
  './11_Back_To_Friends.mp3',
  './12_Ngayon_Kailanman.mp3',
  './Lord%20Huron%20-%20The%20Night%20We%20Met%20(Official%20Audio)%20%5BKtlgYxa6BMU%5D.mp3',
  './ngayon_at_kailanman.mp3'
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
        try { await cache.add(ALL_FILES[i]); } catch(e) {}
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
  if (!url.href.includes('kioshisaiki-lab.github.io')) return;

  e.respondWith(
    fetch(e.request).then(function(response) {
      var clone = response.clone();
      caches.open(CACHE_NAME).then(function(cache) { cache.put(e.request, clone); });
      return response;
    }).catch(function() {
      return caches.match(e.request).then(function(cached) {
        if (cached) return cached;
        if (url.pathname.endsWith('/') || url.pathname.endsWith('.html')) {
          return caches.match('./index.html');
        }
      });
    })
  );
});
