// Bar baterai HP di bar atas (di samping equalizer musik).
//  - menampilkan persen + isi baterai (hijau > 50%, kuning 21-50%, merah <= 20%)
//  - saat di-charge: isi baterai "mengalir" + ikon petir berdenyut
//  - baterai <= 15% dan tidak di-charge: berkedip pelan
// Memakai Battery Status API (Chrome/Edge/Opera di Android & desktop, harus HTTPS).
// Safari/iPhone dan Firefox tidak menyediakannya, jadi bar disembunyikan di sana (tidak ada angka palsu).
(function () {
  'use strict';
  var BOLT = '<svg class="batt-bolt" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" fill="currentColor"/></svg>';

  function build(el) {
    if (el.getAttribute('data-ready') === '1') return;
    el.setAttribute('data-ready', '1');
    if (!navigator.getBattery) { el.hidden = true; return; }

    el.innerHTML = '<span class="batt-ico" aria-hidden="true"><i class="batt-fill"></i></span>' + BOLT + '<span class="batt-pct">--%</span>';
    var fill = el.querySelector('.batt-fill');
    var pct = el.querySelector('.batt-pct');

    navigator.getBattery().then(function (b) {
      function render() {
        var lvl = Math.max(0, Math.min(1, b.level));
        var p = Math.round(lvl * 100);
        fill.style.setProperty('--lvl', String(lvl));
        pct.textContent = p + '%';
        var charging = !!b.charging;
        el.classList.toggle('is-charging', charging);
        el.classList.toggle('is-low', !charging && p <= 15);
        el.setAttribute('data-level', p <= 20 ? 'low' : p <= 50 ? 'mid' : 'high');
        var label = 'Baterai ' + p + '%' + (charging ? ', sedang di-charge' : '');
        el.title = label;
        el.setAttribute('aria-label', label);
        el.hidden = false;
      }
      render();
      b.addEventListener('levelchange', render);
      b.addEventListener('chargingchange', render);
      window.addEventListener('pagehide', function () {
        try { b.removeEventListener('levelchange', render); b.removeEventListener('chargingchange', render); } catch (e) { /* abaikan */ }
      });
    }).catch(function () { el.hidden = true; });
  }

  function init() {
    var els = document.querySelectorAll('[data-battery-bar]');
    for (var i = 0; i < els.length; i++) build(els[i]);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
