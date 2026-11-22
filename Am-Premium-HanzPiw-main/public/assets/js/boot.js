// Boot: dimuat PERTAMA di setiap halaman.
// 1) Warm-up server (kurangi cold start Vercel)
// 2) Cache stale-while-revalidate (data lama tampil instan, lalu disegarkan)
// 3) Top progress bar, reveal bertahap, ripple (micro animation)
(function () {
  'use strict';

  var reduceMotion = false;
  try { reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* abaikan */ }

  // ─── 1) Warm-up ──────────────────────────────────────────────
  // Bangunkan serverless function selagi SDK Firebase & script lain masih diunduh.
  try {
    // warm=1: sekalian membuka koneksi ke Realtime Database (bukan cuma membangunkan function)
    fetch('/api/health?warm=1', { cache: 'no-store', keepalive: true, priority: 'low' }).catch(function () {});
  } catch (e) { /* abaikan */ }

  // ─── 2) Cache ────────────────────────────────────────────────
  var PREFIX = 'am:c:';

  var Cache = {
    get: function (key, maxAgeMs) {
      try {
        var raw = localStorage.getItem(PREFIX + key);
        if (!raw) return null;
        var o = JSON.parse(raw);
        if (maxAgeMs && Date.now() - o.t > maxAgeMs) return null;
        return o.d === undefined ? null : o.d;
      } catch (e) { return null; }
    },
    set: function (key, data) {
      try { localStorage.setItem(PREFIX + key, JSON.stringify({ t: Date.now(), d: data })); } catch (e) { /* storage penuh/diblokir */ }
    },
    remove: function (key) {
      try { localStorage.removeItem(PREFIX + key); } catch (e) { /* abaikan */ }
    },
    clear: function () {
      try {
        Object.keys(localStorage).forEach(function (k) {
          if (k.indexOf(PREFIX) === 0) localStorage.removeItem(k);
        });
      } catch (e) { /* abaikan */ }
    },
    /**
     * Stale-while-revalidate.
     * - Ada cache  -> render(cached, true) SEKETIKA, lalu ambil data baru di belakang layar.
     * - Tidak ada  -> tunggu fetcher (skeleton tampil).
     * Render ulang dilewati kalau data baru identik (tidak ada kedip/animasi ganda).
     * Kalau fetch gagal tapi cache ada, error diabaikan (UI tetap tampil).
     */
    swr: async function (key, fetcher, render, maxAgeMs) {
      var cached = Cache.get(key, maxAgeMs);
      var cachedJson = null;
      if (cached !== null) {
        cachedJson = JSON.stringify(cached);
        try { render(cached, true); } catch (e) { console.warn('[Cache] render cache gagal:', e.message); }
      }
      try {
        var fresh = await fetcher();
        Cache.set(key, fresh);
        if (cachedJson === null || JSON.stringify(fresh) !== cachedJson) render(fresh, false);
        return fresh;
      } catch (err) {
        if (cached === null) throw err;
        console.warn('[Cache] refresh gagal, pakai data cache:', err && err.message);
        return cached;
      }
    },
  };

  // ─── 3) Top progress bar ─────────────────────────────────────
  var Progress = {
    n: 0, el: null, timer: null, value: 0,
    _ensure: function () {
      if (this.el || !document.body) return;
      this.el = document.createElement('div');
      this.el.id = 'top-progress';
      document.body.appendChild(this.el);
    },
    _set: function (v) {
      this.value = v;
      if (this.el) this.el.style.transform = 'scaleX(' + v + ')';
    },
    start: function () {
      this.n++;
      if (this.n > 1) return;
      this._ensure();
      if (!this.el) { this.n = 0; return; }
      var self = this;
      clearTimeout(this.timer);
      this.el.style.transition = 'none';
      this._set(0.05);
      // paksa reflow supaya transisi mulai bersih
      void this.el.offsetWidth;
      this.el.style.transition = '';
      this.el.classList.add('on');
      var tick = function () {
        // makin lama makin pelan, tidak pernah sampai 100% sebelum selesai
        self._set(self.value + (0.92 - self.value) * 0.12);
        self.timer = setTimeout(tick, 250);
      };
      this.timer = setTimeout(tick, 120);
    },
    done: function () {
      this.n = Math.max(0, this.n - 1);
      if (this.n > 0 || !this.el) return;
      var el = this.el;
      var self = this;
      clearTimeout(this.timer);
      this._set(1);
      setTimeout(function () {
        if (self.n === 0) el.classList.remove('on');
      }, 260);
    },
  };

  // ─── 4) Reveal bertahap (stagger) untuk elemen yang baru muncul ──
  var REVEAL_SEL = [
    '.page-header', '.history-item', '.ann-card', '.announcement-item', '.stat-card',
    '.glass-card', '.redeem-item', '.profile-row', '.info-row', '.email-item', '.step-card'
  ].join(',');
  var SKIP_ANCESTOR = '.modal-overlay, #toast-container, #bottom-nav, .skeleton';

  function reveal(nodes) {
    if (reduceMotion) return;
    var counters = new Map();
    nodes.forEach(function (el) {
      if (!el || el.nodeType !== 1 || el.classList.contains('fx-in') || el.classList.contains('skeleton')) return;
      if (el.closest && el.closest(SKIP_ANCESTOR)) return;
      var parent = el.parentElement || document.body;
      var i = counters.get(parent) || 0;
      counters.set(parent, i + 1);
      el.style.setProperty('--fx-i', Math.min(i, 9));
      el.classList.add('fx-in');
      // lepas class setelah selesai supaya hover/transform tidak terganggu & bisa animasi ulang
      setTimeout(function () { el.classList.remove('fx-in'); }, 900);
    });
  }

  function collect(root) {
    var out = [];
    if (root.nodeType !== 1) return out;
    if (root.matches && root.matches(REVEAL_SEL)) out.push(root);
    if (root.querySelectorAll) root.querySelectorAll(REVEAL_SEL).forEach(function (n) { out.push(n); });
    return out;
  }

  function initReveal() {
    if (reduceMotion) return;
    reveal(collect(document.body));
    var mo = new MutationObserver(function (muts) {
      var batch = [];
      muts.forEach(function (m) {
        m.addedNodes.forEach(function (n) { batch = batch.concat(collect(n)); });
      });
      if (batch.length) reveal(batch);
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  // ─── 5) Ripple pada tombol ───────────────────────────────────
  function initRipple() {
    if (reduceMotion) return;
    document.addEventListener('pointerdown', function (e) {
      var t = e.target.closest && e.target.closest('.btn, .filter-btn, .method-tab, .toggle-switch');
      if (!t || t.disabled) return;
      var r = t.getBoundingClientRect();
      var size = Math.max(r.width, r.height) * 1.4;
      var s = document.createElement('span');
      s.className = 'fx-ripple';
      s.style.width = s.style.height = size + 'px';
      s.style.left = (e.clientX - r.left - size / 2) + 'px';
      s.style.top = (e.clientY - r.top - size / 2) + 'px';
      t.appendChild(s);
      setTimeout(function () { s.remove(); }, 600);
    }, { passive: true });
  }

  function onReady() {
    initReveal();
    initRipple();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady);
  else onReady();

  window.Cache = Cache;
  window.Progress = Progress;
  window.reduceMotion = reduceMotion;
})();
