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
    try {
      if (window.top.Backsound) {
        window.Backsound = window.top.Backsound;
        // Menu punya equalizer di bar atas (tanpa tombol); halaman tanpa bar (login dll) memakai tombol bawaan
        if (window.top.Backsound.hideFloating) window.top.Backsound.hideFloating(!!document.querySelector('[data-music-bar]'));
      }
    } catch (e) { /* induk beda origin */ }
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

  var KEY_CAT = 'bgm_cat';     // playlist yang dipilih user: 'ALL' | nama kategori

  function cleanList(arr) {
    var out = [];
    if (!Array.isArray(arr)) return out;
    for (var i = 0; i < arr.length && out.length < 60; i++) {
      var s = arr[i];
      if (s && validUrl(s.url)) out.push({ title: String(s.title || '').substring(0, 60) || ('Lagu ' + (out.length + 1)), url: s.url, cat: String(s.cat || '').toUpperCase().substring(0, 20) });
    }
    return out;
  }

  function validUrl(u) { return typeof u === 'string' && /^(https?:\/\/\S+|\/api\/public\/song\/[a-f0-9]{16})$/i.test(u); }

  var cfg = lsJson(KEY_CFG);
  var hasCachedCfg = !!(cfg && typeof cfg === 'object');
  if (!hasCachedCfg) cfg = { enabled: true, url: DEFAULT_URL };
  if (!validUrl(cfg.url)) cfg.url = DEFAULT_URL;
  cfg.enabled = cfg.enabled !== false;
  cfg.playlist = cleanList(cfg.playlist);

  var audio = null;
  var btn = null;
  var started = false;      // sudah pernah mulai memutar di halaman ini
  var blocked = false;      // autoplay diblokir, menunggu interaksi
  var failed = false;       // audio gagal dimuat
  var gestureBound = false;
  var lastSave = 0;
  var floatHidden = false;  // true = tombol melayang disembunyikan (halaman punya tombol musik sendiri di samping jam)
  var subs = [];            // pendengar status (dipakai bar musik + equalizer di halaman menu)
  var curUrl = '';          // lagu yang sedang dipilih
  var failCount = 0;        // berapa lagu berturut-turut gagal dimuat (untuk lompat otomatis)

  // ─── Playlist ────────────────────────────────────────────────
  // Daftar lagu = playlist owner; kalau kosong, satu-satunya lagu adalah 'url' bawaan.
  function songs() {
    return cfg.playlist.length ? cfg.playlist : [{ title: 'Backsound', url: cfg.url, cat: '' }];
  }
  function categories() {
    var seen = {}, out = ['ALL'];
    songs().forEach(function (s) { if (s.cat && !seen[s.cat]) { seen[s.cat] = 1; out.push(s.cat); } });
    return out;
  }
  function currentCat() {
    var c = lsGet(KEY_CAT) || 'ALL';
    return categories().indexOf(c) === -1 ? 'ALL' : c;
  }
  function queue() {
    var c = currentCat();
    var q = c === 'ALL' ? songs() : songs().filter(function (s) { return s.cat === c; });
    return q.length ? q : songs();
  }
  function findSong(url) {
    var l = songs();
    for (var i = 0; i < l.length; i++) if (l[i].url === url) return l[i];
    return null;
  }
  function randomSong(q) { return q[Math.floor(Math.random() * q.length)]; }
  // Lagu awal: lanjutkan lagu terakhir kalau barusan (< 10 menit), selain itu ACAK supaya tiap user/kunjungan beda
  function pickInitial() {
    var q = queue();
    var pos = lsJson(KEY_POS);
    if (pos && pos.url && Date.now() - (pos.ts || 0) < RESUME_MAX_AGE) {
      for (var i = 0; i < q.length; i++) if (q[i].url === pos.url) return q[i].url;
    }
    return randomSong(q).url;
  }
  curUrl = pickInitial();

  function isPlaying() {
    return !!(audio && !audio.paused && !audio.ended && isEnabled() && !failed);
  }
  function getState() {
    var cur = findSong(curUrl) || {};
    return { enabled: isEnabled(), playing: isPlaying(), blocked: blocked, failed: failed,
             track: { title: cur.title || '', cat: cur.cat || '', url: curUrl }, cat: currentCat(), cats: categories(), count: queue().length };
  }
  function emit() {
    var st = getState();
    subs = subs.filter(function (fn) {
      try { fn(st); return true; } catch (e) { return false; } // halaman pemilik fungsi sudah ditutup
    });
  }
  function subscribe(fn) {
    if (typeof fn !== 'function') return function () {};
    subs.push(fn);
    try { fn(getState()); } catch (e) { /* abaikan */ }
    return function () { subs = subs.filter(function (f) { return f !== fn; }); };
  }
  function hideFloating(flag) {
    floatHidden = !!flag;
    if (btn) btn.style.display = floatHidden ? 'none' : '';
  }

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
    emit();
    if (!btn) return;
    btn.style.display = floatHidden ? 'none' : '';
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
    lsSet(KEY_POS, JSON.stringify({ url: audio.src ? curUrl : '', t: audio.currentTime || 0, ts: now }));
  }

  function ensureAudio() {
    if (audio && audio.dataset.src === curUrl) return audio;
    if (audio) { try { audio.pause(); } catch (e) { /* abaikan */ } }
    audio = new Audio();
    audio.dataset.src = curUrl;
    audio.loop = queue().length <= 1;   // satu lagu: ulang terus; banyak lagu: lanjut ke berikutnya
    audio.preload = 'auto';
    audio.volume = VOLUME;
    failed = false;

    var pos = lsJson(KEY_POS);
    var resumeAt = (pos && pos.url === curUrl && Date.now() - (pos.ts || 0) < RESUME_MAX_AGE) ? Number(pos.t) || 0 : 0;
    if (resumeAt > 0) {
      audio.addEventListener('loadedmetadata', function onMeta() {
        audio.removeEventListener('loadedmetadata', onMeta);
        try { if (resumeAt < (audio.duration || Infinity)) audio.currentTime = resumeAt; } catch (e) { /* abaikan */ }
      });
    }
    audio.addEventListener('timeupdate', function () { savePos(false); });
    ['play', 'playing', 'pause', 'ended', 'waiting'].forEach(function (ev) { audio.addEventListener(ev, emit); });
    audio.addEventListener('playing', function () { if (audio && !audio.paused) failCount = 0; });
    var me = audio;   // abaikan kejadian dari audio lama yang sudah diganti (mis. error terlambat)
    audio.addEventListener('ended', function () { if (me === audio && queue().length > 1) next(); });
    audio.addEventListener('error', function () {
      if (me !== audio) return;
      // Lagu rusak: lompat ke lagu berikutnya; baru dianggap gagal kalau semua lagu di playlist gagal
      if (queue().length > 1 && ++failCount < queue().length) { next(); return; }
      failed = true; blocked = false; renderBtn();
    });
    audio.src = curUrl;
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
        if (a !== audio) return;
        blocked = false;
        unbindGesture();
        renderBtn();
      }).catch(function (err) {
        if (a !== audio) return;   // lagu sudah diganti (mis. lompat dari lagu rusak)
        if (err && err.name === 'NotAllowedError') {
          blocked = true;     // butuh interaksi user dulu
          bindGesture();
        } else if (err && err.name !== 'AbortError') {
          // Banyak lagu: event 'error' pada audio yang akan melompat ke lagu berikutnya
          if (queue().length <= 1) failed = true;
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
    cfg = { enabled: enabled, url: url, playlist: cleanList(next && next.playlist) };
    lsSet(KEY_CFG, JSON.stringify(cfg));
    // Lagu yang sedang dipilih sudah tidak ada di playlist baru: ganti (acak) dan mulai dari awal
    var changed = !findSong(curUrl) || (audio && queue().length <= 1 !== audio.loop);
    if (!findSong(curUrl)) {
      lsSet(KEY_POS, '');
      if (audio) { try { audio.pause(); } catch (e) { /* abaikan */ } audio = null; }
      curUrl = pickInitial();
      failed = false; failCount = 0;
    } else if (audio) {
      audio.loop = queue().length <= 1;
    }
    return changed;
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
          var before = JSON.stringify(cfg);
          var wasCur = curUrl;
          setCfg(nb);
          if (JSON.stringify(cfg) !== before && (curUrl !== wasCur || nb.enabled !== JSON.parse(before).enabled)) apply();
          else emit();
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


  // ─── Ganti lagu / playlist ───────────────────────────────────
  function setTrack(url, userPlay) {
    if (!findSong(url)) return;
    if (audio) { savePos(true); try { audio.pause(); } catch (e) { /* abaikan */ } audio = null; }
    curUrl = url;
    lsSet(KEY_POS, '');
    failed = false;
    if (userPlay) { lsSet(KEY_PREF, 'on'); blocked = false; }
    if (isEnabled()) play(); else emit();
    renderBtn();
  }
  function step(dir) {
    var q = queue();
    var pos = -1;
    for (var i = 0; i < q.length; i++) if (q[i].url === curUrl) { pos = i; break; }
    var n = q[(pos + dir + q.length) % q.length];
    if (q.length === 1 && audio) { try { audio.currentTime = 0; } catch (e) { /* abaikan */ } if (isEnabled()) play(); return; }
    setTrack(n.url, false);
  }
  function next() { step(1); }
  function prev() { step(-1); }
  function setCategory(c) {
    if (categories().indexOf(c) === -1) c = 'ALL';
    lsSet(KEY_CAT, c);
    var q = queue();
    var stay = q.some(function (s) { return s.url === curUrl; });
    if (audio) audio.loop = q.length <= 1;
    if (!stay) setTrack(randomSong(q).url, false); else emit();
  }

  // ─── Panel playlist (bottom sheet, dibuka dengan menekan equalizer) ─────
  var sheet = null;
  var SHEET_CSS =
    '.bgm-sheet{position:fixed;inset:0;z-index:900;display:flex;align-items:flex-end;justify-content:center}' +
    '.bgm-sheet[hidden]{display:none}' +
    '.bgm-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.55);animation:bgmFade .2s ease}' +
    '.bgm-panel{position:relative;width:min(100%,520px);max-height:78vh;display:flex;flex-direction:column;gap:12px;padding:16px 16px calc(16px + env(safe-area-inset-bottom,0px));' +
    'border-radius:24px 24px 0 0;background:var(--bg-secondary,#16161a);color:var(--text-primary,#fff);border:1px solid var(--border-glass,rgba(255,255,255,.2));border-bottom:0;' +
    '-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);animation:bgmUp .25s ease;font-family:inherit}' +
    '.bgm-head{display:flex;align-items:center;justify-content:space-between;font-weight:700;font-size:1rem}' +
    '.bgm-x{width:32px;height:32px;border-radius:50%;border:1px solid var(--border-glass,rgba(255,255,255,.2));background:var(--bg-glass,rgba(255,255,255,.08));color:inherit;font-size:1rem;cursor:pointer}' +
    '.bgm-now{display:flex;flex-direction:column;gap:2px;min-width:0}' +
    '.bgm-now-title{font-weight:600;font-size:.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.bgm-now-sub{font-size:.75rem;color:var(--text-muted,#aaa)}' +
    '.bgm-ctrl{display:flex;align-items:center;justify-content:center;gap:14px}' +
    '.bgm-ctrl button{width:44px;height:44px;border-radius:50%;border:1px solid var(--border-glass,rgba(255,255,255,.2));background:var(--bg-glass,rgba(255,255,255,.08));color:inherit;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform .12s}' +
    '.bgm-ctrl button:active{transform:scale(.9)}' +
    '.bgm-ctrl .bgm-pp{width:54px;height:54px}' +
    '.bgm-cats{display:flex;gap:8px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none}' +
    '.bgm-cats::-webkit-scrollbar{display:none}' +
    '.bgm-chip{flex:0 0 auto;padding:7px 14px;border-radius:999px;border:1px solid var(--border-glass,rgba(255,255,255,.2));background:var(--bg-glass,rgba(255,255,255,.08));color:inherit;font-size:.78rem;font-weight:700;letter-spacing:.5px;cursor:pointer}' +
    '.bgm-chip.active{background:var(--text-primary,#fff);color:var(--bg-primary,#000)}' +
    '.bgm-list{overflow-y:auto;display:flex;flex-direction:column;gap:6px;min-height:0;-webkit-overflow-scrolling:touch}' +
    '.bgm-item{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:10px 12px;border-radius:14px;border:1px solid var(--border-glass,rgba(255,255,255,.2));background:transparent;color:inherit;cursor:pointer;font-size:.85rem}' +
    '.bgm-item.cur{background:var(--bg-glass-hover,rgba(255,255,255,.14))}' +
    '.bgm-item .t{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.bgm-item .c{font-size:.65rem;font-weight:700;letter-spacing:.5px;padding:2px 8px;border-radius:999px;border:1px solid var(--border-glass,rgba(255,255,255,.2));color:var(--text-muted,#aaa)}' +
    '.bgm-item .n{width:18px;text-align:center;color:var(--text-muted,#aaa);font-size:.75rem}' +
    '@keyframes bgmUp{from{transform:translateY(40px);opacity:0}to{transform:none;opacity:1}}' +
    '@keyframes bgmFade{from{opacity:0}to{opacity:1}}';
  var I_PREV = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M6 5h2v14H6zM20 5v14L9.5 12z"/></svg>';
  var I_NEXT = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M16 5h2v14h-2zM4 5v14l10.5-7z"/></svg>';
  var I_PLAY = '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="M7 4v16l13-8z"/></svg>';
  var I_PAUSE = '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function renderSheet() {
    if (!sheet || sheet.hidden) return;
    var st = getState();
    sheet.querySelector('.bgm-now-title').textContent = st.track.title || '—';
    sheet.querySelector('.bgm-now-sub').textContent =
      (st.failed ? 'Gagal dimuat' : st.playing ? 'Sedang diputar' : st.blocked ? 'Ketuk untuk memutar' : 'Dijeda') + ' • ' + st.cat + ' • ' + st.count + ' lagu';
    sheet.querySelector('.bgm-pp').innerHTML = st.playing ? I_PAUSE : I_PLAY;
    var chips = sheet.querySelector('.bgm-cats');
    chips.textContent = '';
    st.cats.forEach(function (c) {
      var b = el('button', 'bgm-chip' + (c === st.cat ? ' active' : ''), c);
      b.type = 'button';
      b.addEventListener('click', function () { setCategory(c); });
      chips.appendChild(b);
    });
    var list = sheet.querySelector('.bgm-list');
    list.textContent = '';
    queue().forEach(function (s, i) {
      var b = el('button', 'bgm-item' + (s.url === curUrl ? ' cur' : ''));
      b.type = 'button';
      b.appendChild(el('span', 'n', s.url === curUrl && st.playing ? '♪' : String(i + 1)));
      b.appendChild(el('span', 't', s.title));
      if (s.cat) b.appendChild(el('span', 'c', s.cat));
      b.addEventListener('click', function () { setTrack(s.url, true); });
      list.appendChild(b);
    });
  }
  function buildSheet() {
    if (sheet) return sheet;
    if (!document.getElementById('bgm-sheet-style')) {
      var st = document.createElement('style');
      st.id = 'bgm-sheet-style';
      st.textContent = SHEET_CSS;
      document.head.appendChild(st);
    }
    sheet = el('div', 'bgm-sheet');
    sheet.id = 'bgm-sheet';
    sheet.hidden = true;
    var backdrop = el('div', 'bgm-backdrop');
    var panel = el('div', 'bgm-panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Playlist lagu');
    var head = el('div', 'bgm-head');
    head.appendChild(el('span', '', 'Playlist'));
    var x = el('button', 'bgm-x', '✕'); x.type = 'button'; x.setAttribute('aria-label', 'Tutup');
    head.appendChild(x);
    var now = el('div', 'bgm-now');
    now.appendChild(el('div', 'bgm-now-title'));
    now.appendChild(el('div', 'bgm-now-sub'));
    var ctrl = el('div', 'bgm-ctrl');
    var bp = el('button', 'bgm-prev'); bp.type = 'button'; bp.innerHTML = I_PREV; bp.setAttribute('aria-label', 'Lagu sebelumnya');
    var pp = el('button', 'bgm-pp'); pp.type = 'button'; pp.setAttribute('aria-label', 'Putar / jeda');
    var bn = el('button', 'bgm-next'); bn.type = 'button'; bn.innerHTML = I_NEXT; bn.setAttribute('aria-label', 'Lagu berikutnya');
    ctrl.appendChild(bp); ctrl.appendChild(pp); ctrl.appendChild(bn);
    panel.appendChild(head); panel.appendChild(now); panel.appendChild(ctrl);
    panel.appendChild(el('div', 'bgm-cats')); panel.appendChild(el('div', 'bgm-list'));
    sheet.appendChild(backdrop); sheet.appendChild(panel);
    document.body.appendChild(sheet);
    backdrop.addEventListener('click', closePlaylist);
    x.addEventListener('click', closePlaylist);
    bp.addEventListener('click', prev);
    bn.addEventListener('click', next);
    pp.addEventListener('click', function () { toggle(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePlaylist(); });
    subs.push(renderSheet);
    return sheet;
  }
  function openPlaylist() {
    if (!document.body) return;
    buildSheet();
    sheet.hidden = false;
    renderSheet();
  }
  function closePlaylist() { if (sheet) sheet.hidden = true; }

  window.Backsound = {
    toggle: toggle,
    refresh: refresh,
    isEnabled: isEnabled,
    isPlaying: isPlaying,
    getState: getState,
    subscribe: subscribe,
    hideFloating: hideFloating,
    attachGestureTo: attachGestureTo,
    next: next,
    prev: prev,
    setCategory: setCategory,
    openPlaylist: openPlaylist,
    closePlaylist: closePlaylist,
    defaultUrl: DEFAULT_URL,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
