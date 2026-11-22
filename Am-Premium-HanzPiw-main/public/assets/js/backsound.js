// Backsound global — dimuat di SEMUA halaman (login, dashboard, 404, dst.)
//
// Aturan:
//  - Default (dari owner, /api/public/status -> backsound): aktif + URL audio bawaan.
//  - Pilihan user (tombol speaker) disimpan di browser dan MENGALAHKAN default owner.
//  - Browser memblokir autoplay sebelum ada interaksi, jadi kalau diblokir: musik mulai
//    otomatis di sentuhan/klik/tombol pertama.
//  - Pindah halaman memuat ulang halaman, jadi posisi lagu disimpan & dilanjutkan.
(function () {
  'use strict';
  // Di dalam iframe (halaman menu di dalam shell): audio dipegang halaman induk supaya tidak putus
  // saat pindah menu. Halaman ini cukup memakai objek Backsound milik induk (mis. owner.html -> refresh()).
  if (window.top !== window) {
    try { if (window.top.Backsound) window.Backsound = window.top.Backsound; } catch (e) { /* induk beda origin */ }
    return;
  }
  if (window.Backsound) return;

  var DEFAULT_URL = 'https://u.pone.rs/lgqzjhof.mp3';
  var KEY_CFG = 'bgm_cfg';     // cache setelan owner { enabled, url }
  var KEY_PREF = 'bgm_pref';   // pilihan user: 'on' | 'off' (kosong = ikut default owner)
  var KEY_POS = 'bgm_pos';     // { url, t, ts } posisi terakhir
  var VOLUME = 0.5;
  var RESUME_MAX_AGE = 10 * 60 * 1000; // posisi lebih lama dari ini tidak dilanjutkan

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* abaikan */ } }
  function lsJson(k) { try { return JSON.parse(lsGet(k) || 'null'); } catch (e) { return null; } }

  function validUrl(u) { return typeof u === 'string' && /^https?:\/\/\S+$/i.test(u); }

  var cfg = lsJson(KEY_CFG);
  var hasCachedCfg = !!(cfg && typeof cfg === 'object');
  if (!hasCachedCfg) cfg = { enabled: true, url: DEFAULT_URL };
  if (!validUrl(cfg.url)) cfg.url = DEFAULT_URL;
  cfg.enabled = cfg.enabled !== false;

  var audio = null;
  var btn = null;
  var started = false;      // sudah pernah mulai memutar di halaman ini
  var blocked = false;      // autoplay diblokir, menunggu interaksi
  var failed = false;       // audio gagal dimuat
  var gestureBound = false;
  var lastSave = 0;

  function isEnabled() {
    var pref = lsGet(KEY_PREF);
    if (pref === 'on') return true;
    if (pref === 'off') return false;
    return cfg.enabled;
  }

  // ─── Tombol ──────────────────────────────────────────────────
  var ICON_ON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
  var ICON_OFF = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/></svg>';

  function injectStyle() {
    if (document.getElementById('bgm-style')) return;
    var st = document.createElement('style');
    st.id = 'bgm-style';
    st.textContent =
      '#bgm-toggle{position:fixed;z-index:800;top:calc(env(safe-area-inset-top,0px) + 12px);right:12px;width:38px;height:38px;' +
      'border-radius:50%;display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer;' +
      'color:var(--text-primary,#fff);background:var(--bg-glass,rgba(255,255,255,.08));border:1px solid var(--border-glass,rgba(255,255,255,.2));' +
      '-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);transition:transform .15s ease,opacity .2s ease,background .2s ease}' +
      '#bgm-toggle:hover{background:var(--bg-glass-hover,rgba(255,255,255,.16))}' +
      '#bgm-toggle:active{transform:scale(.92)}' +
      '#bgm-toggle.off{opacity:.65}' +
      '#bgm-toggle.waiting{animation:bgmPulse 1.6s ease-in-out infinite}' +
      '#bgm-toggle.failed{opacity:.4}' +
      '@keyframes bgmPulse{0%,100%{box-shadow:0 0 0 0 rgba(255,255,255,.35)}50%{box-shadow:0 0 0 7px rgba(255,255,255,0)}}';
    document.head.appendChild(st);
  }

  function renderBtn() {
    if (!btn) return;
    var on = isEnabled();
    btn.innerHTML = on ? ICON_ON : ICON_OFF;
    btn.classList.toggle('off', !on);
    btn.classList.toggle('waiting', on && blocked && !failed);
    btn.classList.toggle('failed', failed);
    var label = failed ? 'Backsound gagal dimuat' : on ? (blocked ? 'Ketuk untuk memutar backsound' : 'Matikan backsound') : 'Nyalakan backsound';
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  function mountBtn() {
    if (btn || !document.body) return;
    injectStyle();
    btn = document.createElement('button');
    btn.id = 'bgm-toggle';
    btn.type = 'button';
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      toggle();
    });
    document.body.appendChild(btn);
    renderBtn();
  }

  // ─── Audio ───────────────────────────────────────────────────
  function savePos(force) {
    if (!audio || !started) return;
    var now = Date.now();
    if (!force && now - lastSave < 1000) return;
    lastSave = now;
    lsSet(KEY_POS, JSON.stringify({ url: audio.src ? cfg.url : '', t: audio.currentTime || 0, ts: now }));
  }

  function ensureAudio() {
    if (audio && audio.dataset.src === cfg.url) return audio;
    if (audio) { try { audio.pause(); } catch (e) { /* abaikan */ } }
    audio = new Audio();
    audio.dataset.src = cfg.url;
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = VOLUME;
    failed = false;

    var pos = lsJson(KEY_POS);
    var resumeAt = (pos && pos.url === cfg.url && Date.now() - (pos.ts || 0) < RESUME_MAX_AGE) ? Number(pos.t) || 0 : 0;
    if (resumeAt > 0) {
      audio.addEventListener('loadedmetadata', function onMeta() {
        audio.removeEventListener('loadedmetadata', onMeta);
        try { if (resumeAt < (audio.duration || Infinity)) audio.currentTime = resumeAt; } catch (e) { /* abaikan */ }
      });
    }
    audio.addEventListener('timeupdate', function () { savePos(false); });
    audio.addEventListener('error', function () { failed = true; blocked = false; renderBtn(); });
    audio.src = cfg.url;
    return audio;
  }

  function onFirstGesture() {
    unbindGesture();
    if (isEnabled()) play();
  }
  var GESTURE_EVENTS = ['pointerdown', 'touchstart', 'keydown', 'click'];
  var extraDocs = []; // dokumen iframe (halaman menu) yang ikut dipantau

  function gestureDocs() {
    extraDocs = extraDocs.filter(function (d) { try { return !!d.defaultView; } catch (e) { return false; } });
    return [document].concat(extraDocs);
  }
  function bindGesture() {
    if (gestureBound) return;
    gestureBound = true;
    gestureDocs().forEach(function (d) {
      GESTURE_EVENTS.forEach(function (ev) { d.addEventListener(ev, onFirstGesture, { capture: true, passive: true }); });
    });
  }
  function unbindGesture() {
    if (!gestureBound) return;
    gestureBound = false;
    gestureDocs().forEach(function (d) {
      GESTURE_EVENTS.forEach(function (ev) { d.removeEventListener(ev, onFirstGesture, { capture: true }); });
    });
  }
  // Dipanggil shell setiap halaman di iframe selesai dimuat
  function attachGestureTo(doc) {
    if (!doc || extraDocs.indexOf(doc) !== -1) return;
    extraDocs.push(doc);
    if (gestureBound) {
      GESTURE_EVENTS.forEach(function (ev) { doc.addEventListener(ev, onFirstGesture, { capture: true, passive: true }); });
    }
  }

  function play() {
    if (!isEnabled()) return;
    var a = ensureAudio();
    var pr;
    try { pr = a.play(); } catch (e) { pr = null; }
    started = true;
    if (pr && typeof pr.then === 'function') {
      pr.then(function () {
        blocked = false;
        unbindGesture();
        renderBtn();
      }).catch(function (err) {
        if (err && err.name === 'NotAllowedError') {
          blocked = true;     // butuh interaksi user dulu
          bindGesture();
        } else if (err && err.name !== 'AbortError') {
          failed = true;
        }
        renderBtn();
      });
    } else {
      blocked = false;
      renderBtn();
    }
  }

  function stop() {
    savePos(true);
    if (audio) { try { audio.pause(); } catch (e) { /* abaikan */ } }
    blocked = false;
    unbindGesture();
  }

  function apply() {
    if (isEnabled()) play(); else stop();
    renderBtn();
  }

  function toggle() {
    var next = !isEnabled();
    lsSet(KEY_PREF, next ? 'on' : 'off');
    if (next) { failed = false; blocked = false; }
    apply(); // dipanggil dari klik user, jadi lolos aturan autoplay
  }

  // ─── Setelan owner ───────────────────────────────────────────
  function setCfg(next) {
    var url = next && validUrl(next.url) ? next.url : DEFAULT_URL;
    var enabled = !next || next.enabled !== false;
    var urlChanged = url !== cfg.url;
    cfg = { enabled: enabled, url: url };
    lsSet(KEY_CFG, JSON.stringify(cfg));
    if (urlChanged) {
      lsSet(KEY_POS, ''); // audio berbeda: mulai dari awal
      if (audio) { try { audio.pause(); } catch (e) { /* abaikan */ } audio = null; }
    }
    return urlChanged;
  }

  function fetchCfg(timeoutMs, bust) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || 6000) : null;
    return fetch('/api/public/status' + (bust ? '?t=' + Date.now() : ''), { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.json(); })
      .then(function (j) { return j && j.data && j.data.backsound ? j.data.backsound : null; })
      .catch(function () { return null; })
      .then(function (b) { if (timer) clearTimeout(timer); return b; });
  }

  // Panggil setelah owner menyimpan setelan supaya langsung berlaku di halaman ini
  function refresh() {
    return fetchCfg(6000, true).then(function (b) {
      if (!b) return;
      setCfg(b);
      apply();
    });
  }

  // ─── Start ───────────────────────────────────────────────────
  function start() {
    mountBtn();
    // Tanpa cache setelan owner (kunjungan pertama): tunggu sebentar supaya tidak sempat
    // memutar audio kalau owner menetapkan default nonaktif.
    var ready = hasCachedCfg ? Promise.resolve(null) : fetchCfg(2500);
    ready.then(function (b) {
      if (b) { setCfg(b); hasCachedCfg = true; }
      apply();
      // Segarkan setelan di belakang layar (halaman berikutnya memakai cache baru)
      if (hasCachedCfg && !b) {
        fetchCfg(6000).then(function (nb) {
          if (!nb) return;
          var changed = nb.enabled !== cfg.enabled || nb.url !== cfg.url;
          setCfg(nb);
          if (changed) apply();
        });
      }
    });
  }

  // Simpan posisi saat halaman ditinggalkan / disembunyikan
  window.addEventListener('pagehide', function () { savePos(true); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) savePos(true);
  });

  // Sinkron antar tab: pilihan user berubah di tab lain
  window.addEventListener('storage', function (e) {
    if (e.key === KEY_PREF) apply();
  });

  window.Backsound = {
    toggle: toggle,
    refresh: refresh,
    isEnabled: isEnabled,
    attachGestureTo: attachGestureTo,
    defaultUrl: DEFAULT_URL,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
