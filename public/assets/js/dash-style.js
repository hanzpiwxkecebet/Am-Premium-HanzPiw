// Tampilan dashboard — dimuat di <head> (sinkron, supaya tidak ada kedipan).
//
// Owner mengatur (panel Owner -> Sistem -> Tampilan Dashboard):
//  - 'gray' -> tampilan abu-abu bawaan (TIDAK berubah sama sekali)
//  - 'rgb'  -> kartu dengan tepi RGB yang bergerak
// Setelan di-cache di browser, lalu disegarkan dari /api/public/status di belakang layar.
(function () {
  'use strict';

  var KEY = 'dash_style';
  var KEY_TS = 'dash_style_ts';
  var TTL = 30 * 1000;

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* abaikan */ } }
  function clean(v) { return v === 'rgb' ? 'rgb' : 'gray'; }

  function apply(style) {
    var on = clean(style) === 'rgb';
    document.documentElement.classList.toggle('dash-rgb', on);
  }

  function refresh(force) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 6000) : null;
    return fetch('/api/public/status' + (force === true ? '?t=' + Date.now() : ''), { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (timer) clearTimeout(timer);
        var s = j && j.data && j.data.dashboardStyle;
        if (!s) return;
        s = clean(s);
        lsSet(KEY, s);
        lsSet(KEY_TS, String(Date.now()));
        apply(s);
      })
      .catch(function () { if (timer) clearTimeout(timer); });
  }

  // 1) Terapkan cache SEKARANG (sebelum halaman tampil)
  apply(lsGet(KEY));

  // 2) Segarkan dari server kalau cache sudah lama
  var age = Date.now() - Number(lsGet(KEY_TS) || 0);
  var go = function () { if (!(age < TTL)) refresh(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go, { once: true }); else go();

  window.DashStyle = { refresh: refresh, apply: apply, current: function () { return clean(lsGet(KEY)); } };
})();
