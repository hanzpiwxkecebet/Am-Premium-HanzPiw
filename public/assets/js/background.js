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

  function ensureLayer(c) {
    if (!document.body) return false;
    if (!layer || !layer.parentNode) {
      layer = document.createElement('div');
      layer.id = 'custom-bg';
      layer.setAttribute('aria-hidden', 'true');
      layer.innerHTML = '<i class="bg-img"></i><i class="bg-dim"></i>';
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
