// Bar atas untuk SEMUA menu: jam WIB + equalizer musik. Cukup pasang script ini setelah nav.js.
// Menyisipkan <div class="top-bar"> di paling atas .page-content (kalau belum ada), lalu memuat
// wib-clock.js dan music-bar.js yang mengisinya.
(function () {
  'use strict';
  var pc = document.querySelector('.page-content');
  if (!pc) return;

  if (!pc.querySelector('.top-bar')) {
    var bar = document.createElement('div');
    bar.className = 'top-bar';
    bar.innerHTML = '<div class="clock-pill" data-wib-clock></div><div class="music-pill" data-music-bar></div>';
    pc.insertBefore(bar, pc.firstChild);
  }

  function load(src) {
    var s = document.createElement('script');
    s.src = src;
    document.head.appendChild(s);
  }
  load('/assets/js/wib-clock.js?v=4');
  load('/assets/js/music-bar.js?v=5');
})();
