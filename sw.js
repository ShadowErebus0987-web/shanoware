// Bump when the SHELL list changes. File contents update on their own (stale-while-revalidate).
const CACHE = 'shanoware-v1';
const SHELL = [
  './', 'index.html', 'style.css', 'app.js', 'games.json', 'news.json', 'manifest.webmanifest',
  'fonts/silkscreen-400.woff2', 'fonts/silkscreen-700.woff2',
  'fonts/pixelify-400.woff2', 'fonts/pixelify-700.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/favicon-32.png'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(SHELL);
    // Precache every game listed so it plays offline after the first visit.
    try {
      const games = await (await fetch('games.json')).json();
      await c.addAll(games.flatMap(g => [g.path, g.art]).filter(Boolean));
    } catch (err) { /* a broken game entry must not block the launcher */ }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const key = new URL(req.url); key.search = ''; // ?slot=2 shares one cached copy
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(key);
    const net = fetch(req).then(r => { if (r.ok) c.put(key, r.clone()); return r; });
    e.waitUntil(net.catch(() => {}));
    return hit || net;
  })());
});
