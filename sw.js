// Block Brick Service Worker — offline support with progress reporting
const CACHE_NAME = 'blockbrick-v64';

// Core files only — cached on install (fast)
const CORE_FILES = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

const GITHUB_BASE = 'https://raw.githubusercontent.com/kioshisaiki-lab/BlockBrick-/main/';

// Mp3s — cached in background using full GitHub raw URLs (must match audio.src)
const MP3_FILES = [
  GITHUB_BASE + '01_Kalapastangan.mp3',
  GITHUB_BASE + '02_Risk_It_All.mp3',
  GITHUB_BASE + '03_The_Man_Who_Cant_Be_Moved.mp3',
  GITHUB_BASE + '05_Lifetime.mp3',
  GITHUB_BASE + '06_Do_I_Wanna_Know.mp3',
  GITHUB_BASE + '07_Sagip.mp3',
  GITHUB_BASE + '08_Hirap_Kalimutan.mp3',
  GITHUB_BASE + '09_Tensionado.mp3',
  GITHUB_BASE + '10_Panata.mp3',
  GITHUB_BASE + '11_Back_To_Friends.mp3',
  GITHUB_BASE + '12_Ngayon_Kailanman.mp3',
  GITHUB_BASE + 'Lord%20Huron%20-%20The%20Night%20We%20Met%20(Official%20Audio)%20%5BKtlgYxa6BMU%5D.mp3',
  GITHUB_BASE + 'ngayon_at_kailanman.mp3'
];

var cacheProgress = { done: 0, total: MP3_FILES.length, finished: false };

function broadcast(msg) {
  self.clients.matchAll({ includeUncontrolled: true }).then(function(clients) {
    clients.forEach(function(c) { c.postMessage(msg); });
  });
}

// Step 1: Install — only cache core files (fast)
self.addEventListener('install', function(e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(async function(cache) {
      for (var i = 0; i < CORE_FILES.length; i++) {
        try {
          var req = new Request(CORE_FILES[i], { cache: 'no-cache' });
          var resp = await fetch(req);
          await cache.put(req, resp);
        } catch(err) {}
      }
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

// Step 2: Background cache mp3s after activate
async function cacheMp3sInBackground() {
  const cache = await caches.open(CACHE_NAME);
  cacheProgress = { done: 0, total: MP3_FILES.length, finished: false };
  broadcast({ type: 'CACHE_START', total: MP3_FILES.length });

  for (var i = 0; i < MP3_FILES.length; i++) {
    try {
      // Skip if already cached
      const already = await cache.match(MP3_FILES[i]);
      if (already) {
        cacheProgress.done++;
        broadcast({ type: 'CACHE_PROGRESS', done: cacheProgress.done, total: cacheProgress.total });
        continue;
      }
      // Fetch and store with plain URL as key (so playback cache.match finds it)
      var resp = await fetch(MP3_FILES[i]);
      await cache.put(MP3_FILES[i], resp);
    } catch(err) {}
    cacheProgress.done++;
    broadcast({ type: 'CACHE_PROGRESS', done: cacheProgress.done, total: cacheProgress.total });
  }

  cacheProgress.finished = true;
  broadcast({ type: 'CACHE_DONE' });
}

// Page can ask for current progress on load
self.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'GET_CACHE_STATUS') {
    e.source.postMessage({
      type: cacheProgress.finished ? 'CACHE_DONE' : 'CACHE_PROGRESS',
      done: cacheProgress.done,
      total: cacheProgress.total
    });
  }
  // Page tells SW to start background caching
  if (e.data && e.data.type === 'START_BG_CACHE') {
    cacheMp3sInBackground();
  }
});

self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const isGithubPages = url.href.includes('kioshisaiki-lab.github.io');
  const isGithubRaw = url.href.includes('raw.githubusercontent.com/kioshisaiki-lab');
  const isMp3 = url.pathname.endsWith('.mp3');

  // Serve cached mp3s from GitHub raw (lazy cache fallback)
  if (isGithubRaw && isMp3) {
    e.respondWith(
      caches.open(CACHE_NAME).then(async function(cache) {
        const cached = await cache.match(e.request);
        if (cached) return cached;
        try {
          const response = await fetch(e.request);
          cache.put(e.request, response.clone());
          return response;
        } catch(err) {
          return new Response('', { status: 503 });
        }
      })
    );
    return;
  }

  if (!isGithubPages) return;

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
