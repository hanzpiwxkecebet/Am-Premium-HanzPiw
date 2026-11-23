// Bar jam WIB (Asia/Jakarta). Pasang di halaman mana pun dengan: <div class="clock-pill" data-wib-clock></div>
// Selalu WIB walau zona waktu HP beda. Offset dari header Date server dipakai supaya
// tetap akurat walau jam HP user salah/dimajukan.
(function () {
  'use strict';
  var fmt;
  try {
    fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });
  } catch (e) { fmt = null; }

  var offset = 0; // selisih (ms) server - perangkat

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function wibText(ms) {
    if (fmt) {
      var parts = fmt.formatToParts(new Date(ms)), o = {};
      parts.forEach(function (p) { o[p.type] = p.value; });
      var h = o.hour === '24' ? '00' : o.hour;
      return h + ':' + o.minute + ':' + o.second;
    }
    // Fallback tanpa Intl: UTC + 7 jam
    var d = new Date(ms + 7 * 3600 * 1000);
    return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds());
  }

  function tick() {
    var txt = wibText(Date.now() + offset) + ' WIB';
    var els = document.querySelectorAll('[data-wib-clock]');
    for (var i = 0; i < els.length; i++) {
      var t = els[i].querySelector('.clock-time');
      if (t) { if (t.textContent !== txt) t.textContent = txt; }
    }
  }

  function build(el) {
    if (el.querySelector('.clock-time')) return;
    el.innerHTML = '<span class="clock-dot"></span><span class="clock-time">--:--:-- WIB</span>';
  }

  function syncServer() {
    try {
      var t0 = Date.now();
      fetch('/favicon.svg', { method: 'HEAD', cache: 'no-store' }).then(function (r) {
        var h = r.headers.get('date');
        if (!h) return;
        var server = new Date(h).getTime();
        if (isNaN(server)) return;
        var rtt = Date.now() - t0;
        offset = server + rtt / 2 - Date.now();
        tick();
      }).catch(function () { /* pakai jam perangkat */ });
    } catch (e) { /* abaikan */ }
  }

  function init() {
    var els = document.querySelectorAll('[data-wib-clock]');
    for (var i = 0; i < els.length; i++) build(els[i]);
    tick();
    // Selaraskan ke pergantian detik supaya tidak telat
    setTimeout(function () { tick(); setInterval(tick, 1000); }, 1000 - (Date.now() % 1000));
    syncServer();
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { tick(); syncServer(); } });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
