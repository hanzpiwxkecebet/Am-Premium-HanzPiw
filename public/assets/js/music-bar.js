// Tombol lagu (aktif/nonaktif) + equalizer di bar atas, di samping jam WIB.
//  - lagu terputar -> batang equalizer bergerak
//  - lagu mati / menunggu sentuhan pertama / gagal dimuat -> batang diam
// Audio-nya tetap hidup di halaman induk (shell) lewat window.top.Backsound, jadi musik tidak putus
// saat pindah menu. (Equalizer berupa animasi, bukan analisis suara asli: audio dari domain lain
// tidak bisa dianalisis browser.)
(function () {
  'use strict';
  var BARS = 7;
  var ICON_ON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
  var ICON_OFF = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/></svg>';

  function getBacksound() {
    try { return window.top.Backsound || window.Backsound || null; } catch (e) { return window.Backsound || null; }
  }
  function getFloat() {
    try { return window.top.document.getElementById('bgm-toggle'); } catch (e) { return null; }
  }

  function build(el) {
    if (el.getAttribute('data-ready') === '1') return;
    el.setAttribute('data-ready', '1');

    var bars = '';
    for (var i = 0; i < BARS; i++) bars += '<i style="--i:' + i + '"></i>';
    el.innerHTML = '<button type="button" class="music-btn" aria-pressed="false"></button><span class="eq" aria-hidden="true">' + bars + '</span>';
    var btn = el.querySelector('.music-btn');
    var eq = el.querySelector('.eq');
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var bs = getBacksound();
      if (bs && bs.toggle) bs.toggle();
    });

    function render(st) {
      var on = !!st.enabled;
      btn.innerHTML = on ? ICON_ON : ICON_OFF;
      var label = st.failed ? 'Backsound gagal dimuat' : on ? (st.blocked ? 'Ketuk untuk memutar lagu' : 'Matikan lagu') : 'Nyalakan lagu';
      btn.title = label;
      btn.setAttribute('aria-label', label);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      el.classList.toggle('is-off', !on);
      el.classList.toggle('is-waiting', on && !!st.blocked && !st.failed);
      el.classList.toggle('is-failed', !!st.failed);
      eq.classList.toggle('playing', !!st.playing);
    }

    // Sinkronkan dengan status lagu yang sebenarnya: lewat langganan (instan) + polling 0,5 dtk (cadangan)
    function sync() {
      var fl = getFloat();
      if (fl) fl.style.display = 'none'; // tombol melayang bawaan tidak dipakai di menu
      var bs = getBacksound();
      if (!bs) { render({ enabled: false, playing: false }); return; }
      try { if (bs.hideFloating) bs.hideFloating(true); } catch (e) { /* abaikan */ }
      var st = null;
      try { st = bs.getState ? bs.getState() : { enabled: bs.isEnabled ? bs.isEnabled() : true, playing: false }; } catch (e) { /* abaikan */ }
      if (st) render(st);
    }

    sync();
    var unsub = function () {};
    var bs0 = getBacksound();
    try { if (bs0 && bs0.subscribe) unsub = bs0.subscribe(render); } catch (e) { /* polling tetap jalan */ }
    var timer = setInterval(sync, 500);
    window.addEventListener('pagehide', function () {
      clearInterval(timer);
      try { unsub(); } catch (e) { /* abaikan */ }
    });
  }

  function init() {
    var els = document.querySelectorAll('[data-music-bar]');
    for (var i = 0; i < els.length; i++) build(els[i]);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
