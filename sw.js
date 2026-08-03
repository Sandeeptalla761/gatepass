/**
 * TVL Gate Pass — service worker
 *
 * Deliberately NETWORK FIRST, not cache first.
 *
 * This app is edited often, and a cache-first worker would keep serving
 * an old copy of create.html or index.html long after a change was
 * committed — the hardest kind of bug to spot, because the page looks
 * fine and simply behaves like last week's version.
 *
 * So: always try the network, and fall back to a cached copy only when
 * the phone is genuinely offline. Requests to Apps Script are never
 * cached at all — a stale gate pass reply would be worse than an error.
 */

const CACHE = 'tvl-gatepass-v1';

const SHELL = [
  './',
  './index.html',
  './create.html',
  './qrcode.js',
  './logo.png',
  './icon-192.png',
  './icon-512.png',
  './manifest.json'
];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // Individual failures must not abort the install.
      return Promise.all(SHELL.map(function (u) {
        return c.add(u).catch(function () {});
      }));
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  const req = e.request;

  // Never touch anything that talks to the sheet.
  if (req.method !== 'GET' || req.url.indexOf('script.google.com') > -1) {
    return;
  }

  e.respondWith(
    fetch(req)
      .then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      })
      .catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || new Response(
            '<h2 style="font:16px sans-serif;padding:20px">No internet ' +
            'connection.</h2><p style="font:14px sans-serif;padding:0 20px">' +
            'The gate pass system needs a connection to reach the sheet. ' +
            'Reconnect and reopen.</p>',
            { headers: { 'Content-Type': 'text/html' } });
        });
      })
  );
});
