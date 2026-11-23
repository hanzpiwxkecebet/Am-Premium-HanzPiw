// Background kustom — dimuat di <head> SEMUA halaman (sinkron, supaya tidak ada kedipan).
//
// Owner mengatur (panel Owner -> Sistem): aktif/nonaktif, gambar (link atau upload), tingkat blur.
//  - Nonaktif  -> tampilan bawaan (gelombang abu-abu + partikel), tidak berubah sama sekali.
//  - Aktif     -> gambar sebagai latar, di-blur sedikit + diredupkan supaya teks tetap terbaca.
//
// Gambar digambar SEKALI di halaman induk (shell). Halaman menu di dalam iframe cukup dibuat transparan,
// jadi gambar tidak dimuat ulang dan tidak berkedip saat pindah menu. Halaman yang dibuka mandiri
// (mis. 404 atau splash) menggambar sendiri.
(function () {
  'use strict';

  var KEY = 'bg_cfg';       // cache setelan { enabled, url, blur, version }
  var KEY_TS = 'bg_cfg_ts'; // kapan terakhir disegarkan dari server
  var TTL = 30 * 1000;      // segarkan paling sering tiap 30 detik
  var inFrame = window.top !== window;

  // Halaman menu di dalam iframe: pakai objek milik induk, tidak menggambar sendiri
  if (inFrame) {
    try { if (window.top.Background) window.Background = window.top.Background; } catch (e) { /* beda origin */ }
  } else if (window.Background) {
    return;
  }

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* abaikan */ } }

  function readCfg() {
    try { return JSON.parse(lsGet(KEY) || 'null'); } catch (e) { return null; }
  }
  // Hanya http(s) atau gambar upload milik sendiri. Tanda kutip/kurung ditolak (mencegah injeksi CSS).
  function validUrl(u) {
    return typeof u === 'string' && u.length < 1100 && /^(https?:\/\/|\/api\/public\/background\?)[^\s"'()<>\\]+$/i.test(u);
  }
  function isOn(c) { return !!(c && c.enabled === true && validUrl(c.url)); }

  // URL yang gagal dimuat (link rusak) -> kembali ke tampilan bawaan. Disimpan per tab supaya halaman iframe ikut tahu.
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { if (v) sessionStorage.setItem(k, v); else sessionStorage.removeItem(k); } catch (e) { /* abaikan */ } }
  var failedUrl = ssGet('bg_failed');
  var layer = null;

  function markRoot(on) {
    var el = document.documentElement;
    el.classList.toggle('bg-custom', !!on);
    el.classList.toggle('bg-in-frame', !!on && inFrame);
  }

  // Halaman di dalam iframe shell ikut diset (dipanggil dari induk saat setelan berubah)
  function syncFrame(on) {
    try {
      var f = document.getElementById('app-frame');
      var d = f && f.contentDocument;
      if (d && d.documentElement) {
        d.documentElement.classList.toggle('bg-custom', !!on);
        d.documentElement.classList.toggle('bg-in-frame', !!on);
      }
    } catch (e) { /* abaikan */ }
  }

  function removeLayer() {
    if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
    layer = null;
  }

  // ─── Deteksi gambar background untuk mode RGB ───────────────────────────────
  // Gambar dikecilkan ke 32x32 piksel lalu dihitung: kecerahan rata-rata dan kejenuhan warna.
  //  - gambar pudar / hitam-putih  -> lapisan RGB penuh (mode 'color': seluruh gambar diwarnai RGB)
  //  - gambar sudah berwarna       -> lapisan RGB lebih tipis (mode 'overlay': warna asli tetap terlihat)
  //  - gambar terang               -> peredam lebih gelap supaya teks tetap terbaca
  // Gambar dari domain lain tanpa izin CORS tidak bisa dibaca piksel-nya: pakai nilai tengah (tetap RGB).
  function toneFrom(lum, sat) {
    var mode, op;
    if (sat < 0.22) { mode = 'color'; op = 0.72; }
    else if (sat < 0.5) { mode = 'color'; op = 0.55; }
    else { mode = 'overlay'; op = 0.6; }
    var dim = lum > 0.6 ? 0.56 : lum > 0.35 ? 0.44 : 0.3;
    return { lum: lum, sat: sat, mode: mode, op: op, dim: dim };
  }
  function analyze(url, cb) {
    var ck = 'bg_tone:' + url;
    try { var hit = JSON.parse(lsGet(ck) || 'null'); if (hit && hit.mode) { cb(hit); return; } } catch (e) { /* hitung ulang */ }
    var im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = function () {
      var tone = null;
      try {
        var cv = document.createElement('canvas');
        cv.width = cv.height = 32;
        var cx = cv.getContext('2d');
        cx.drawImage(im, 0, 0, 32, 32);
        var d = cx.getImageData(0, 0, 32, 32).data, n = 0, L = 0, S = 0;
        for (var i = 0; i < d.length; i += 4) {
          var r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
          var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
          L += 0.2126 * r + 0.7152 * g + 0.0722 * b;
          S += mx === 0 ? 0 : (mx - mn) / mx;
          n++;
        }
        if (n) tone = toneFrom(L / n, S / n);
      } catch (e) { tone = null; }   // canvas "tainted"
      if (tone) lsSet(ck, JSON.stringify(tone));
      cb(tone || toneFrom(0.45, 0.3));
    };
    im.onerror = function () { cb(toneFrom(0.45, 0.3)); };
    im.src = url;
  }
  function applyTone(t) {
    if (!layer || !t) return;
    layer.style.setProperty('--rgb-blend', t.mode);
    layer.style.setProperty('--rgb-op', String(t.op));
    layer.style.setProperty('--rgb-dim', String(t.dim));
    layer.setAttribute('data-tone', t.lum > 0.6 ? 'light' : t.lum > 0.35 ? 'mid' : 'dark');
    layer.setAttribute('data-sat', t.sat < 0.22 ? 'low' : t.sat < 0.5 ? 'mid' : 'high');
  }

  function ensureLayer(c) {
    if (!document.body) return false;
    if (!layer || !layer.parentNode) {
      layer = document.createElement('div');
      layer.id = 'custom-bg';
      layer.setAttribute('aria-hidden', 'true');
      layer.innerHTML = '<i class="bg-img"></i><i class="bg-rgb"></i><i class="bg-dim"></i>';
      document.body.insertBefore(layer, document.body.firstChild);
    }
    var img = layer.firstChild;
    var blur = Number.isFinite(Number(c.blur)) ? Math.min(24, Math.max(0, Number(c.blur))) : 6;
    layer.style.setProperty('--bg-blur', blur + 'px');
    if (img.getAttribute('data-src') !== c.url) {
      img.setAttribute('data-src', c.url);
      layer.classList.remove('ready');
      // Muat dulu; baru ditampilkan kalau berhasil (link rusak = tetap tampilan bawaan)
      var probe = new Image();
      probe.onload = function () {
        if (img.getAttribute('data-src') !== c.url) return;
        img.style.backgroundImage = 'url("' + c.url + '")';
        layer.classList.add('ready');
        // Deteksi gambar (terang/gelap, pudar/berwarna) -> atur kekuatan lapisan RGB (aktif kalau mode RGB menyala)
        analyze(c.url, function (tone) { if (img.getAttribute('data-src') === c.url) applyTone(tone); });
      };
      probe.onerror = function () {
        failedUrl = c.url;
        ssSet('bg_failed', c.url);
        apply(readCfg());
      };
      probe.src = c.url;
    }
    return true;
  }

  function apply(c) {
    var on = isOn(c) && c.url !== failedUrl;
    markRoot(on);
    if (inFrame) return;            // iframe: cukup transparan, gambar digambar induk
    syncFrame(on);
    if (!on) { removeLayer(); return; }
    if (!ensureLayer(c)) {
      document.addEventListener('DOMContentLoaded', function () { apply(readCfg()); }, { once: true });
    }
  }

  function save(b) {
    var c = { enabled: !!(b && b.enabled), url: (b && b.url) || '', blur: b ? b.blur : 6, version: (b && b.version) || 0 };
    lsSet(KEY, JSON.stringify(c));
    lsSet(KEY_TS, String(Date.now()));
    return c;
  }

  // force = true: lewati cache edge (dipakai setelah owner menyimpan, supaya langsung terlihat)
  function refresh(force) {
    if (inFrame) return Promise.resolve();
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 6000) : null;
    return fetch('/api/public/status' + (force === true ? '?t=' + Date.now() : ''), { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (timer) clearTimeout(timer);
        var b = j && j.data && j.data.background;
        if (!b) return;
        var prev = readCfg();
        var next = save(b);
        if (!prev || prev.url !== next.url || prev.version !== next.version) { failedUrl = null; ssSet('bg_failed', ''); } // gambar baru: coba lagi
        apply(next);
      })
      .catch(function () { if (timer) clearTimeout(timer); });
  }

  // Di iframe tetap memakai objek milik induk (supaya refresh() dari panel owner menyegarkan halaman induk)
  if (!inFrame || !window.Background) window.Background = { refresh: refresh, apply: function () { apply(readCfg()); } };

  // 1) Terapkan cache SEKARANG (sebelum halaman tampil)
  apply(readCfg());

  // 2) Halaman induk / mandiri: segarkan dari server kalau cache sudah lama
  if (!inFrame) {
    var age = Date.now() - Number(lsGet(KEY_TS) || 0);
    var go = function () { if (!(age < TTL)) refresh(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go, { once: true }); else go();
  }
})();
