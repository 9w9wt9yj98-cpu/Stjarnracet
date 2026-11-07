// network-first, cache fallback (so it also works offline once loaded)
const C = 'stjarnracet-v11';
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== C && k.startsWith('stjarnracet-v')).map((k) => caches.delete(k))))
    .then(() => self.clients.claim())
));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // /3d/ is a separate prototype. Do not store or serve it from the 2D cache.
  const path = new URL(e.request.url).pathname;
  if (/\/3d(\/|$)/.test(path)) return;
  e.respondWith(fetch(e.request).then((r) => { const cp = r.clone(); caches.open(C).then((c) => c.put(e.request, cp)); return r; })
    .catch(() => caches.match(e.request)));
});
