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

  function onFrameLoad() {
    var w, d;
    try {
      w = frame.contentWindow;
      d = w.document;
      if (w.location.origin !== location.origin) return;
    } catch (e) { return; }

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
})();
