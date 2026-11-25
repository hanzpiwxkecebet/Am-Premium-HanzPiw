// Notifikasi tag Global Chat. Berjalan di semua menu (kecuali halaman Chat sendiri).
// Hanya @username kamu (atau @semua dari owner) yang membuat notifikasi; pesan biasa tidak.
(function () {
  'use strict';
  if (window.ChatNotify) return;
  var POLL_MS = 60000, timer = null, uid = null, started = false, busy = false;

  function key(n) { return 'am_cn_' + n + '_' + uid; }
  function get(n) { try { return Number(localStorage.getItem(key(n))) || 0; } catch (e) { return 0; } }
  function set(n, v) { try { localStorage.setItem(key(n), String(v)); } catch (e) { /* abaikan */ } }

  function badge(n) { try { if (window.Nav && Nav.setBadge) Nav.setBadge('chat', n); } catch (e) { /* abaikan */ } }

  function toast(from, text, count) {
    var title = count > 1 ? count + ' tag baru di Global Chat' : (from || 'Seseorang') + ' menyebutmu';
    var msg = count > 1 ? 'Terakhir dari ' + (from || 'Seseorang') + ': ' + text : text;
    try {
      var t = window.Toast && Toast.info ? Toast.info(msg, title) : null;
      if (t && t.addEventListener) { t.style.cursor = 'pointer'; t.addEventListener('click', function () { window.location.href = '/chat'; }); }
    } catch (e) { /* abaikan */ }
    try {
      if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        var n = new Notification(title, { body: msg, icon: '/assets/img/logo-mark.png', tag: 'am-chat-mention' });
        n.onclick = function () { window.focus(); window.location.href = '/chat'; };
      }
    } catch (e) { /* abaikan */ }
  }

  async function poll() {
    if (!uid || busy) return;
    busy = true;
    try {
      var r = await AMApp.apiCall('GET', '/api/chat/mentions');
      var d = (r && r.data) || { items: [], all: null };
      var items = d.items || [], all = d.all;
      var readSeen = get('read'), toastSeen = get('toast');
      var fresh = items.filter(function (m) { return m.ts > toastSeen; });
      var allNew = all && all.ts > toastSeen ? all : null;
      var allUnread = all && all.ts > readSeen ? 1 : 0;
      badge(items.length + allUnread);
      if (fresh.length || allNew) {
        var list = fresh.slice(); if (allNew) list.push(allNew);
        list.sort(function (a, b) { return a.ts - b.ts; });
        var last = list[list.length - 1];
        toast(last.from, last.text, list.length);
        set('toast', last.ts);
      }
    } catch (e) { /* jaringan putus: coba lagi nanti */ }
    busy = false;
  }

  function loop() {
    clearTimeout(timer);
    timer = setTimeout(function () { if (!document.hidden) poll(); loop(); }, POLL_MS);
  }

  window.ChatNotify = {
    // Dipanggil halaman Chat: semua tag dianggap sudah dibaca
    markSeen: function (u) { if (u) uid = u; if (!uid) return; var now = Date.now(); set('read', now); set('toast', now); badge(0); },
    start: function () {
      if (started) return; started = true;
      if (!(window.firebase && firebase.auth && window.AMApp)) return;
      firebase.auth().onAuthStateChanged(function (u) {
        if (!u) { uid = null; clearTimeout(timer); badge(0); return; }
        uid = u.uid; poll(); loop();
      });
      document.addEventListener('visibilitychange', function () { if (!document.hidden) poll(); });
    }
  };
})();
