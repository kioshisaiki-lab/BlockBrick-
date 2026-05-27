// Block Brick Service Worker v66 — music downloader support
const CACHE_NAME = 'blockbrick-v4.0';

const CORE_FILES = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

const GITHUB_BASE = 'https://raw.githubusercontent.com/kioshisaiki-lab/BlockBrick-/main/';

const MP3_NAMES = [
  '01_Kalapastangan.mp3',
  '02_Risk_It_All.mp3',
  '03_The_Man_Who_Cant_Be_Moved.mp3',
  '05_Lifetime.mp3',
  '06_Do_I_Wanna_Know.mp3',
  '07_Sagip.mp3',
  '08_Hirap_Kalimutan.mp3',
  '09_Tensionado.mp3',
  '10_Panata.mp3',
  '11_Back_To_Friends.mp3',
  '12_Ngayon_Kailanman.mp3',
  'Lord%20Huron%20-%20The%20Night%20We%20Met%20(Official%20Audio)%20%5BKtlgYxa6BMU%5D.mp3',
  'ngayon_at_kailanman.mp3'
];

var cacheProgress = { done: 0, total: MP3_NAMES.length, finished: false };

function broadcast(msg) {
  self.clients.matchAll({ includeUncontrolled: true }).then(function(clients) {
    clients.forEach(function(c) { c.postMessage(msg); });
  });
}

// Install: cache core files only
self.addEventListener('install', function(e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(async function(cache) {
      for (var i = 0; i < CORE_FILES.length; i++) {
        try {
          var resp = await fetch(CORE_FILES[i], { cache: 'no-cache' });
          await cache.put(CORE_FILES[i], resp);
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

// Background: fetch full mp3 as ArrayBuffer and store as blob response
// This avoids range-request issues with cached audio
async function cacheMp3sInBackground() {
  const cache = await caches.open(CACHE_NAME);
  cacheProgress = { done: 0, total: MP3_NAMES.length, finished: false };
  broadcast({ type: 'CACHE_START', total: MP3_NAMES.length });

  for (var i = 0; i < MP3_NAMES.length; i++) {
    const url = GITHUB_BASE + MP3_NAMES[i];
    try {
      const already = await cache.match(url);
      if (!already) {
        // Fetch full file (no range header) so we get a complete cacheable response
        var resp = await fetch(url, { mode: 'cors', cache: 'no-cache' });
        if (resp.ok) {
          // Clone and store — browser can serve this for audio playback
          await cache.put(url, resp.clone());
        }
      }
    } catch(err) {
      console.log('Failed to cache:', url, err);
    }
    cacheProgress.done++;
    broadcast({ type: 'CACHE_PROGRESS', done: cacheProgress.done, total: cacheProgress.total });
  }

  cacheProgress.finished = true;
  broadcast({ type: 'CACHE_DONE' });
}

self.addEventListener('message', function(e) {
  if (!e.data) return;
  if (e.data.type === 'GET_CACHE_STATUS') {
    e.source.postMessage({
      type: cacheProgress.finished ? 'CACHE_DONE' : 'CACHE_PROGRESS',
      done: cacheProgress.done,
      total: cacheProgress.total
    });
  }
  if (e.data.type === 'START_BG_CACHE') {
    cacheMp3sInBackground();
  }
  if (e.data.type === 'CHECK_TRACK_CACHED') {
    // Check whether a specific URL is in the cache
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.match(e.data.url);
    }).then(function(match) {
      e.source.postMessage({ type: 'TRACK_CACHED_RESULT', url: e.data.url, cached: !!match });
    }).catch(function() {
      e.source.postMessage({ type: 'TRACK_CACHED_RESULT', url: e.data.url, cached: false });
    });
  }
  if (e.data.type === 'CACHE_ONE_TRACK') {
    // Download and cache a single track, report back
    var url = e.data.url;
    caches.open(CACHE_NAME).then(async function(cache) {
      try {
        var already = await cache.match(url);
        if (already) {
          e.source.postMessage({ type: 'ONE_TRACK_DONE', url: url, ok: true });
          return;
        }
        var resp = await fetch(url, { mode: 'cors', cache: 'no-cache' });
        if (resp.ok) {
          await cache.put(url, resp.clone());
          e.source.postMessage({ type: 'ONE_TRACK_DONE', url: url, ok: true });
        } else {
          e.source.postMessage({ type: 'ONE_TRACK_DONE', url: url, ok: false });
        }
      } catch(err) {
        e.source.postMessage({ type: 'ONE_TRACK_DONE', url: url, ok: false });
      }
    });
  }
});

self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;

  const url = e.request.url;
  const isGithubPages = url.includes('kioshisaiki-lab.github.io');
  const isGithubRaw = url.includes('raw.githubusercontent.com/kioshisaiki-lab');
  const isMp3 = url.endsWith('.mp3') || url.includes('.mp3?');

  // Handle mp3 requests from GitHub raw
  if (isGithubRaw && isMp3) {
    e.respondWith(
      caches.open(CACHE_NAME).then(async function(cache) {
        // Normalize URL — strip query params for matching
        const cleanUrl = url.split('?')[0];
        const cached = await cache.match(cleanUrl);

        if (cached) {
          // Handle range requests for audio streaming from cache
          const rangeHeader = e.request.headers.get('range');
          if (rangeHeader) {
            const arrayBuffer = await cached.clone().arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);
            const total = bytes.length;

            // Parse range: bytes=start-end
            const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
            const start = parseInt(match[1]);
            const end = match[2] ? parseInt(match[2]) : total - 1;
            const chunk = bytes.slice(start, end + 1);

            return new Response(chunk, {
              status: 206,
              statusText: 'Partial Content',
              headers: {
                'Content-Type': 'audio/mpeg',
                'Content-Range': `bytes ${start}-${end}/${total}`,
                'Content-Length': chunk.length,
                'Accept-Ranges': 'bytes'
              }
            });
          }
          return cached;
        }

        // Not cached — fetch from network and cache it
        try {
          const response = await fetch(e.request);
          if (response.ok) cache.put(cleanUrl, response.clone());
          return response;
        } catch(err) {
          return new Response('', { status: 503 });
        }
      })
    );
    return;
  }

  // Handle GitHub Pages files
  if (!isGithubPages) return;

  e.respondWith(
    caches.open(CACHE_NAME).then(async function(cache) {
      const cached = await cache.match(url);
      if (cached) return cached;
      try {
        const response = await fetch(e.request);
        if (response.ok) cache.put(url, response.clone());
        return response;
      } catch (err) {
        const u = new URL(url);
        if (u.pathname.endsWith('/') || u.pathname.endsWith('.html')) {
          return cache.match('./index.html');
        }
      }
    })
  );
});
