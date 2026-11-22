// Shell: halaman induk yang TIDAK pernah reload. Isi menu (dashboard, generator, dst.) dimuat di
// dalam iframe, sedangkan backsound hidup di halaman induk ini, jadi musik tidak putus saat pindah menu.
// URL di address bar tetap bersih (/dashboard, /generator, ...) dan tombol back/forward tetap jalan.
(function () {
  'use strict';
  if (window.top !== window) return;

  var frame = document.getElementById('app-frame');
  if (!frame) return;

  function toEmbed(href) {
    var u = new URL(href, location.origin);
    u.searchParams.set('_embed', '1');
    return u.pathname + u.search + u.hash;
  }
  function toClean(href) {
    var u = new URL(href, location.origin);
    u.searchParams.delete('_embed');
    return u.pathname + u.search + u.hash;
  }

  var leaveTimer = null;
  function showFrame() {
    clearTimeout(leaveTimer);
    frame.classList.remove('leaving');
  }

  function onFrameLoad() {
    showFrame(); // fade-in halaman baru
    var w, d;
    try {
      w = frame.contentWindow;
      d = w.document;
      if (w.location.origin !== location.origin) return;
    } catch (e) { return; }

    // Fade-out halaman lama saat pindah menu (pengaman: otomatis tampil lagi kalau navigasi batal)
    try {
      w.addEventListener('beforeunload', function () {
        frame.classList.add('leaving');
        clearTimeout(leaveTimer);
        leaveTimer = setTimeout(showFrame, 4000);
      });
    } catch (e) { /* abaikan */ }

    // Samakan address bar & judul tab dengan halaman di dalam iframe
    var clean = toClean(w.location.href);
    if (clean !== location.pathname + location.search + location.hash) {
      try { history.replaceState(null, '', clean); } catch (e) { /* abaikan */ }
    }
    try { if (d.title) document.title = d.title; } catch (e) { /* abaikan */ }

    // Sentuhan/klik di dalam iframe juga harus bisa memulai musik (aturan autoplay browser)
    if (window.Backsound && window.Backsound.attachGestureTo) window.Backsound.attachGestureTo(d);
  }

  frame.addEventListener('load', onFrameLoad);
  frame.src = toEmbed(location.href);

  // ─── PWA: service worker + tombol install ───────────────────────
  // Halaman di dalam iframe memakai window.top.AMInstall (mis. tombol "Install Aplikasi" di Profile).
  var deferredPrompt = null;
  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  }
  window.AMInstall = {
    // 'ready' = bisa langsung install, 'ios' = perlu langkah manual di Safari, 'installed' / 'none' = tidak ditampilkan
    status: function () {
      if (isStandalone()) return 'installed';
      if (deferredPrompt) return 'ready';
      if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return 'ios';
      return 'none';
    },
    prompt: function () {
      if (!deferredPrompt) return Promise.resolve('unavailable');
      var p = deferredPrompt;
      deferredPrompt = null;
      p.prompt();
      return p.userChoice.then(function (c) { return c && c.outcome; }).catch(function () { return 'dismissed'; });
    }
  };
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredPrompt = e; });
  window.addEventListener('appinstalled', function () { deferredPrompt = null; });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () { /* abaikan: website tetap jalan tanpa SW */ });
    });
  }
})();
