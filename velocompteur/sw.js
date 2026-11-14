// VéloCompteur (version web) : l'appli reste utilisable sans réseau une fois ouverte.
const C = 'vc-app-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const r = e.request, u = r.url;
  if (r.method !== 'GET' || !(r.mode === 'navigate' || u.includes('unpkg.com/maplibre-gl'))) return;
  e.respondWith((async () => {
    const c = await caches.open(C);
    try { const res = await fetch(r); if (res.ok || res.type === 'opaque') c.put(r, res.clone()); return res; }
    catch (err) { const m = await c.match(r, {ignoreSearch:true}); if (m) return m; throw err; }
  })());
});
