// Service worker minimal : requis pour l'installation en PWA, pas de cache hors ligne pour l'instant.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',()=>{});
