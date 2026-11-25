// Running text di Dashboard. Diatur owner (Owner Panel -> Sistem), diambil dari /api/public/status -> ticker.
(function () {
  'use strict';
  var KEY = 'ticker_cache';
  var box = document.getElementById('ticker');
  if (!box) return;
  var label = document.getElementById('ticker-label');
  var track = document.getElementById('ticker-track');
  var last = '';

  function lsGet() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function lsSet(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* abaikan */ } }

  function render(t) {
    var items = t && t.enabled !== false && Array.isArray(t.items) ? t.items.filter(function (x) { return typeof x === 'string' && x; }).slice(0, 5) : [];
    var sig = JSON.stringify([t && t.label, items]);
    if (sig === last) return;
    last = sig;
    if (!items.length) { box.hidden = true; track.textContent = ''; return; }
    label.textContent = String(t.label || 'PENGUMUMAN').substring(0, 14);
    box.hidden = false;
    build(items, 1);
    // Kalau teks lebih pendek dari lebar strip, ulangi isinya supaya tidak ada ruang kosong saat berputar
    requestAnimationFrame(function () {
      var view = track.parentNode.getBoundingClientRect().width;
      var w = track.firstChild ? track.firstChild.getBoundingClientRect().width : 0;
      if (w > 0 && w < view) { build(items, Math.ceil(view / w)); w = track.firstChild.getBoundingClientRect().width; }
      track.style.setProperty('--tk-w', w + 'px');
      track.style.setProperty('--tk-dur', Math.max(8, w / 55) + 's');   // kecepatan tetap ± 55 px/detik
    });
  }

  // Dua grup berurutan supaya putarannya mulus tanpa jeda; teks dipasang dengan textContent (aman dari HTML)
  function build(items, rep) {
    track.textContent = '';
    for (var c = 0; c < 2; c++) {
      var grp = document.createElement('div'); grp.className = 'ticker-grp';
      if (c === 1) grp.setAttribute('aria-hidden', 'true');
      for (var r = 0; r < rep; r++) items.forEach(function (txt) {
        var s = document.createElement('span'); s.className = 'ticker-item'; s.textContent = txt;
        var d = document.createElement('i'); d.className = 'ticker-dot'; d.setAttribute('aria-hidden', 'true');
        grp.appendChild(s); grp.appendChild(d);
      });
      track.appendChild(grp);
    }
  }

  function load() {
    return fetch('/api/public/status?t=' + Math.floor(Date.now() / 10000), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) { var t = j && j.data && j.data.ticker; if (t) { lsSet(t); render(t); } })
      .catch(function () { /* offline: tetap pakai cache */ });
  }

  var cached = lsGet();
  if (cached) render(cached);
  load();
  setInterval(function () { if (!document.hidden) load(); }, 60000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) load(); });
})();
