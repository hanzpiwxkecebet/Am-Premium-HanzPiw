// Bar musik: tombol aktif/nonaktif lagu + equalizer, menetap di samping bar jam.
// Pasang di halaman mana pun dengan: <div class="music-pill" data-music-bar></div>
//
// Audio-nya sendiri tetap hidup di halaman induk (shell) lewat window.top.Backsound, jadi musik tidak
// putus saat pindah menu. File ini hanya menggambar tombol + equalizer dan mengikuti status pemutaran:
//  - lagu menyala (benar-benar terputar) -> batang equalizer bergerak
//  - lagu mati / menunggu sentuhan pertama / gagal dimuat -> batang diam
// (Equalizer berupa animasi, bukan analisis suara asli: audio dari domain lain tidak bisa dianalisis browser.)
(function () {
  'use strict';

  var ICON_ON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
  var ICON_OFF = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/></svg>';
  var BARS = 7;

  function getBacksound() {
    try { return window.top.Backsound || window.Backsound || null; } catch (e) { return window.Backsound || null; }
  }

  function build(el) {
    if (el.getAttribute('data-ready') === '1') return;
    el.setAttribute('data-ready', '1');

    var bars = '';
    for (var i = 0; i < BARS; i++) bars += '<i style="--i:' + i + '"></i>';
    el.innerHTML =
      '<button type="button" class="music-btn" aria-pressed="false"></button>' +
      '<span class="eq" aria-hidden="true">' + bars + '</span>';

    var btn = el.querySelector('.music-btn');
    var eq = el.querySelector('.eq');

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

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var bs = getBacksound();
      if (bs && bs.toggle) bs.toggle();
    });

    var bs = getBacksound();
    if (!bs) { render({ enabled: false, playing: false }); return; }

    // Sembunyikan tombol melayang bawaan (kembali muncul saat pindah ke halaman yang tidak punya bar ini)
    try { bs.hideFloating(true); } catch (e) { /* abaikan */ }
    var unsub = bs.subscribe ? bs.subscribe(render) : function () {};
    if (!bs.subscribe) render({ enabled: bs.isEnabled ? bs.isEnabled() : true, playing: false });

    window.addEventListener('pagehide', function () {
      try { unsub(); } catch (e) { /* abaikan */ }
      try { bs.hideFloating(false); } catch (e) { /* abaikan */ }
    });
  }

  function init() {
    var els = document.querySelectorAll('[data-music-bar]');
    for (var i = 0; i < els.length; i++) build(els[i]);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
