// Service worker AM Premium — membuat website bisa di-install (PWA) dan tetap menampilkan halaman dasar saat offline.
// Strategi: network-first (selalu ambil terbaru; cache hanya cadangan saat offline). /api/ dan domain luar TIDAK di-cache.
const CACHE = 'am-premium-v2';
const PRECACHE = ['/shell.html', '/404.html', '/assets/css/main.css', '/favicon.svg', '/assets/icons/icon-192.png', '/assets/img/logo-full.png', '/assets/img/logo-mark.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(PRECACHE.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function offlinePage() {
  return new Response(
    '<!DOCTYPE html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Offline</title><body style="margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;' +
    'background:#0f0f0f;color:#fff;font-family:system-ui,sans-serif;text-align:center;padding:24px">' +
    '<div><div style="font-size:2.4rem;font-weight:800;margin-bottom:8px">Offline</div>' +
    '<div style="opacity:.7;margin-bottom:20px">Tidak ada koneksi internet. Coba lagi setelah tersambung.</div>' +
    '<button onclick="location.reload()" style="padding:12px 22px;border-radius:12px;border:0;font-weight:700;background:#fff;color:#000">Coba lagi</button></div>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;          // Firebase, font, audio backsound, dll.
  if (url.pathname.startsWith('/api/')) return;              // data selalu dari server
  if (url.pathname === '/sw.js') return;

  event.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    } catch (err) {
      const cached = await caches.match(req);
      if (cached) return cached;
      if (req.mode === 'navigate') {
        // Buka menu saat offline: tampilkan shell (isi menu hanya ada kalau pernah dibuka sebelumnya)
        const shell = await caches.match('/shell.html');
        if (shell && new URL(req.url).searchParams.get('_embed') === null && url.pathname !== '/') return shell;
        return offlinePage();
      }
      if (req.destination === 'iframe' || req.destination === 'document') return offlinePage();
      return Response.error();
    }
  })());
});
