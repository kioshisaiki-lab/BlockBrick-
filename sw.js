// Block Brick Service Worker — offline support with full asset caching
const CACHE_NAME = 'blockbrick-v53';
const BASE = 'https://kioshisaiki-lab.github.io/BlockBrick-/';

const CORE_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

const MP3_FILES = [
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
  './Lord Huron - The Night We Met (Official Audio) [KtlgYxa6BMU].mp3',
  './ngayon_at_kailanman.mp3'
];

// Install — cache core files immediately, mp3s in background
self.addEventListener('install', function(e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      // Cache core files first (fast)
      return cache.addAll(CORE_FILES).then(function() {
        // Cache mp3s in background (slow, don't block install)
        MP3_FILES.forEach(function(url) {
          cache.add(url).catch(function() {
            console.log('Could not cache mp3 (offline?): ' + url);
          });
        });
      });
    })
  );
});

// Activate — delete old caches
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// Fetch — network first, fall back to cache (offline support)
self.addEventListener('fetch', function(e) {
  // Skip non-GET and cross-origin (Firebase etc)
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (!url.href.includes('kioshisaiki-lab.github.io')) return;

  e.respondWith(
    fetch(e.request).then(function(response) {
      // Save fresh copy to cache
      var clone = response.clone();
      caches.open(CACHE_NAME).then(function(cache) {
        cache.put(e.request, clone);
      });
      return response;
    }).catch(function() {
      // Offline — serve from cache
      return caches.match(e.request).then(function(cached) {
        if (cached) return cached;
        // If it's the main page, serve index.html
        if (url.pathname.endsWith('/') || url.pathname.endsWith('.html')) {
          return caches.match('./index.html');
        }
      });
    })
  );
});
