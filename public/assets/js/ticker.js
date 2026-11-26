// Running text di Dashboard: tiap teks = satu bar sendiri (bertumpuk ke bawah) dengan label sendiri.
// Diatur owner (Owner Panel -> Sistem), diambil dari /api/public/status -> ticker.
(function () {
  'use strict';
  var KEY = 'ticker_cache2';
  var box = document.getElementById('ticker');
  if (!box) return;
  var last = '';

  function lsGet() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function lsSet(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* abaikan */ } }

  // Satu bar: label + jalur teks. Dua grup berurutan supaya putarannya mulus; teks dipasang dengan textContent (aman dari HTML)
  function build(track, text, rep) {
    track.textContent = '';
    for (var c = 0; c < 2; c++) {
      var grp = document.createElement('div'); grp.className = 'ticker-grp';
      if (c === 1) grp.setAttribute('aria-hidden', 'true');
      for (var r = 0; r < rep; r++) {
        var s = document.createElement('span'); s.className = 'ticker-item'; s.textContent = text;
        var d = document.createElement('i'); d.className = 'ticker-dot'; d.setAttribute('aria-hidden', 'true');
        grp.appendChild(s); grp.appendChild(d);
      }
      track.appendChild(grp);
    }
  }

  function makeBar(it) {
    var bar = document.createElement('div'); bar.className = 'ticker';
    var lab = document.createElement('span'); lab.className = 'ticker-label'; lab.textContent = String(it.label || 'PENGUMUMAN').substring(0, 14);
    var view = document.createElement('div'); view.className = 'ticker-view';
    var track = document.createElement('div'); track.className = 'ticker-track';
    view.appendChild(track); bar.appendChild(lab); bar.appendChild(view);
    box.appendChild(bar);
    build(track, it.text, 1);
    requestAnimationFrame(function () {
      var vw = view.getBoundingClientRect().width;
      var w = track.firstChild ? track.firstChild.getBoundingClientRect().width : 0;
      // Teks lebih pendek dari bar: ulangi isinya supaya tidak ada ruang kosong saat berputar
      if (w > 0 && w < vw) { build(track, it.text, Math.ceil(vw / w)); w = track.firstChild.getBoundingClientRect().width; }
      track.style.setProperty('--tk-w', w + 'px');
      track.style.setProperty('--tk-dur', Math.max(8, w / 55) + 's');   // kecepatan tetap ± 55 px/detik
    });
  }

  function render(t) {
    var items = t && t.enabled !== false && Array.isArray(t.items)
      ? t.items.filter(function (x) { return x && typeof x.text === 'string' && x.text; }).slice(0, 5) : [];
    var sig = JSON.stringify(items);
    if (sig === last) return;
    last = sig;
    box.textContent = '';
    if (!items.length) { box.hidden = true; return; }
    box.hidden = false;
    items.forEach(makeBar);
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
