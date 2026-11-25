// Global Chat — realtime lewat Firebase Realtime Database (baca), kirim lewat server (/api/chat/*).
// Kalau realtime gagal (Rules belum dipasang / jaringan memblokir), otomatis pindah ke polling tiap 3 detik.
// Semua teks ditampilkan dengan textContent / node DOM (tidak pernah innerHTML), jadi aman dari XSS.
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var LABELS = { owner: 'OWNER', admin: 'ADMIN', moderator: 'MOD', premium: 'PREMIUM', user: 'USER' };
  var INITIAL = 60, OLDER = 40, POLL_MS = 3000, MAX_IMG_BYTES = 215 * 1024;

  var S = {
    uid: '', role: 'user', name: '', username: '',
    msgs: [], byId: {}, stickers: {}, pin: null,
    reply: null, img: null, sending: false,
    mode: 'init', db: null, lastTs: 0, hasMore: false, ready: false, newCount: 0,
    unsub: [],
  };
  var list, input;

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function icon(name) { var i = el('i', 'ic ic-' + name); return i; }
  function isStaff() { return S.role === 'moderator' || S.role === 'admin' || S.role === 'owner'; }
  function isOwner() { return S.role === 'owner'; }

  // ─── Waktu (WIB) ──────────────────────────────────────────
  var TZ = 'Asia/Jakarta';
  function fmtTime(ts) { return new Date(ts).toLocaleTimeString('id-ID', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).replace('.', ':'); }
  function dayKey(ts) { return new Date(ts).toLocaleDateString('en-CA', { timeZone: TZ }); }
  function fmtDay(ts) {
    var k = dayKey(ts), now = Date.now();
    if (k === dayKey(now)) return 'Hari ini';
    if (k === dayKey(now - 86400000)) return 'Kemarin';
    return new Date(ts).toLocaleDateString('id-ID', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' });
  }

  // ─── Teks: link + @mention (node DOM, bukan innerHTML) ────
  var RICH_RE = /(https?:\/\/[^\s<>"']+)|(@[A-Za-z0-9_.]{2,30})/g;
  function mentionsMe(m) {
    if (!S.username || !m.text) return false;
    var re = new RegExp('(^|[^A-Za-z0-9_.])@' + S.username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![A-Za-z0-9_])', 'i');
    return re.test(m.text);
  }
  function richText(text) {
    var box = el('div', 'cm-text');
    var last = 0, m;
    RICH_RE.lastIndex = 0;
    while ((m = RICH_RE.exec(text))) {
      if (m.index > last) box.appendChild(document.createTextNode(text.slice(last, m.index)));
      if (m[1]) {
        var url = m[1], tail = '';
        var t = /[.,;:!?)\]]+$/.exec(url);
        if (t) { tail = t[0]; url = url.slice(0, -tail.length); }
        var a = el('a', null, url);
        a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer nofollow';
        box.appendChild(a);
        if (tail) box.appendChild(document.createTextNode(tail));
      } else {
        var me = S.username && m[2].slice(1).toLowerCase() === S.username.toLowerCase();
        box.appendChild(el('span', 'cm-mention' + (me ? ' me' : ''), m[2]));
      }
      last = m.index + m[0].length;
    }
    if (last < text.length) box.appendChild(document.createTextNode(text.slice(last)));
    return box;
  }

  // ─── Avatar ───────────────────────────────────────────────
  var avaCache = {}, avaPending = {}, avaTimer = null;
  function setAva(d, url) {
    if (!url) return;
    d.textContent = '';
    var img = el('img'); img.alt = ''; img.src = url; img.loading = 'lazy';
    d.appendChild(img);
  }
  function avatarEl(uid, name) {
    var d = el('div', 'cm-ava', (String(name || '?').trim().charAt(0) || '?').toUpperCase());
    d.setAttribute('data-uid', uid);
    if (avaCache[uid]) setAva(d, avaCache[uid]);
    else if (!(uid in avaCache)) { avaPending[uid] = 1; clearTimeout(avaTimer); avaTimer = setTimeout(flushAvatars, 150); }
    return d;
  }
  function flushAvatars() {
    var uids = Object.keys(avaPending).slice(0, 30);
    if (!uids.length) return;
    uids.forEach(function (u) { delete avaPending[u]; });
    AMApp.apiCall('GET', '/api/chat/avatars?uids=' + encodeURIComponent(uids.join(','))).then(function (r) {
      uids.forEach(function (u) { avaCache[u] = (r.data && r.data[u]) || ''; });
    }).catch(function () {
      uids.forEach(function (u) { avaCache[u] = ''; });
    }).then(function () {
      var nodes = document.querySelectorAll('.cm-ava');
      for (var i = 0; i < nodes.length; i++) { var c = avaCache[nodes[i].getAttribute('data-uid')]; if (c && !nodes[i].firstElementChild) setAva(nodes[i], c); }
      if (Object.keys(avaPending).length) flushAvatars();
    });
  }

  // ─── Render pesan ─────────────────────────────────────────
  function badgeEl(role) {
    if (!LABELS[role]) return null;
    return el('span', 'badge ' + Auth.getRoleBadgeClass(role), LABELS[role]);
  }
  function stickerNode(id) {
    var meta = S.stickers[id];
    var url = '/api/chat/sticker/' + encodeURIComponent(id);
    if (meta && meta.m === 'video/webm') {
      var v = el('video', 'cm-st'); v.src = url; v.autoplay = true; v.loop = true; v.muted = true; v.playsInline = true; v.setAttribute('playsinline', '');
      return v;
    }
    var im = el('img', 'cm-st'); im.src = url; im.alt = 'stiker'; im.loading = 'lazy';
    return im;
  }
  function act(cls, ic, label, fn) {
    var b = el('button', 'cm-act ' + cls); b.type = 'button'; b.setAttribute('aria-label', label); b.title = label;
    b.appendChild(icon(ic));
    b.addEventListener('click', function (e) { e.stopPropagation(); fn(); });
    return b;
  }
  function buildMsg(m) {
    var mine = m.uid === S.uid;
    var row = el('div', 'cm-row' + (mine ? ' mine' : ''));
    row.setAttribute('data-id', m.id);
    if (!mine) row.appendChild(avatarEl(m.uid, m.name));
    var col = el('div', 'cm-col');
    var onlySticker = !!m.st && !m.text;
    var bub = el('div', 'cm-bub' + (onlySticker ? ' sticker' : '') + (!mine && mentionsMe(m) ? ' mention' : ''));

    if (!mine) {
      var head = el('div', 'cm-head');
      var nm = el('button', 'cm-name', m.name || 'User'); nm.type = 'button';
      nm.title = m.username ? 'Sebut @' + m.username : '';
      nm.addEventListener('click', function () { if (m.username) insertMention(m.username); });
      head.appendChild(nm);
      var bd = badgeEl(m.role); if (bd) head.appendChild(bd);
      bub.appendChild(head);
    } else {
      // Pesan sendiri: tampilkan role-mu juga
      var mh = el('div', 'cm-head'); mh.style.justifyContent = 'flex-end';
      mh.appendChild(el('span', 'cm-name', 'Kamu'));
      var mb = badgeEl(m.role || 'user'); if (mb) mh.appendChild(mb);
      bub.appendChild(mh);
    }
    if (m.reply) {
      var q = el('div', 'cm-quote');
      q.appendChild(el('b', null, m.reply.name || 'User'));
      q.appendChild(el('span', null, m.reply.text || ''));
      q.addEventListener('click', function () { jumpTo(m.reply.id); });
      bub.appendChild(q);
    }
    if (m.img) {
      var im = el('img', 'cm-img'); im.src = '/api/chat/media/' + encodeURIComponent(m.img); im.alt = 'gambar'; im.loading = 'lazy';
      im.addEventListener('click', function () { lightbox(im.src); });
      im.addEventListener('load', function () { if (S.stick) scrollBottom(); });
      bub.appendChild(im);
    }
    if (m.song) bub.appendChild(songCard(m.song));
    if (m.st) bub.appendChild(stickerNode(m.st));
    if (m.text) bub.appendChild(richText(m.text));

    var foot = el('div', 'cm-foot');
    foot.appendChild(el('span', 'cm-time', fmtTime(m.ts)));
    foot.appendChild(act('', 'reply', 'Balas', function () { setReply(m); }));
    if (isStaff()) foot.appendChild(act('', 'pin', 'Pin pesan', function () { pinMsg(m); }));
    if (mine || isStaff()) foot.appendChild(act('danger', 'trash', 'Hapus', function () { delMsg(m); }));
    bub.appendChild(foot);

    col.appendChild(bub);
    row.appendChild(col);
    return row;
  }

  function dayEl(ts) { var d = el('div', 'chat-day', fmtDay(ts)); d.setAttribute('data-day', dayKey(ts)); return d; }

  function distFromBottom() { return list.scrollHeight - list.scrollTop - list.clientHeight; }
  function scrollBottom() { list.scrollTop = list.scrollHeight; }
  S.stick = true;
  function nearBottom() { return distFromBottom() < 140; }

  function renderAll() {
    var keep = distFromBottom();
    var frag = document.createDocumentFragment();
    if (S.hasMore) {
      var more = el('button', 'chat-more', 'Muat pesan lama'); more.type = 'button'; more.id = 'chat-more';
      more.addEventListener('click', loadOlder);
      frag.appendChild(more);
    }
    var prevDay = '';
    S.msgs.forEach(function (m) {
      var k = dayKey(m.ts);
      if (k !== prevDay) { frag.appendChild(dayEl(m.ts)); prevDay = k; }
      frag.appendChild(buildMsg(m));
    });
    if (!S.msgs.length && S.ready) frag.appendChild(el('div', 'chat-empty', 'Belum ada pesan. Jadilah yang pertama menyapa!'));
    list.textContent = '';
    list.appendChild(frag);
    list.scrollTop = list.scrollHeight - list.clientHeight - keep;
  }

  function addMsg(m) {
    if (!m || !m.id || S.byId[m.id]) return;
    S.byId[m.id] = m;
    if (m.ts > S.lastTs) S.lastTs = m.ts;
    var last = S.msgs[S.msgs.length - 1];
    if (last && m.ts < last.ts) {            // datang tidak berurutan (jarang): urutkan ulang
      S.msgs.push(m); S.msgs.sort(function (a, b) { return a.ts - b.ts; });
      if (S.ready) renderAll();
      return;
    }
    S.msgs.push(m);
    if (!S.ready) return;                     // saat muat awal: digambar sekali di akhir
    var wasNear = nearBottom() || m.uid === S.uid;
    var emp = list.querySelector('.chat-empty'); if (emp) emp.remove();
    if (!last || dayKey(last.ts) !== dayKey(m.ts)) list.appendChild(dayEl(m.ts));
    list.appendChild(buildMsg(m));
    if (wasNear) scrollBottom();
    else { S.newCount++; showNew(); }
  }
  function removeMsg(id) {
    if (!S.byId[id]) return;
    delete S.byId[id];
    S.msgs = S.msgs.filter(function (m) { return m.id !== id; });
    if (S.ready) renderAll();
  }
  function showNew() { var b = $('chat-new'); b.textContent = '↓ ' + S.newCount + ' pesan baru'; b.classList.add('show'); }
  function hideNew() { S.newCount = 0; $('chat-new').classList.remove('show'); }
  function jumpTo(id) {
    var node = list.querySelector('[data-id="' + String(id).replace(/[^A-Za-z0-9_-]/g, '') + '"]');
    if (!node) { Toast.info('Pesan asli sudah tidak ada di layar'); return; }
    node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    node.classList.remove('flash'); void node.offsetWidth; node.classList.add('flash');
  }

  // ─── Pin ──────────────────────────────────────────────────
  function renderPin() {
    var box = $('chat-pin'), p = S.pin;
    if (!p || (!p.text && !p.img && !p.st)) { box.classList.remove('show'); return; }
    box.classList.add('show');
    box.classList.toggle('staff', isStaff());
    var who = $('chat-pin-who'); who.textContent = 'Pin dari ' + (p.name || 'admin') + ' ';
    var bd = badgeEl(p.role); if (bd) who.appendChild(bd);
    var t = $('chat-pin-text');
    t.textContent = p.text || (p.st ? '[stiker]' : '[gambar]');
  }

  // ─── Stiker ───────────────────────────────────────────────
  // Favorit disimpan per akun di perangkat ini (localStorage)
  function favKey() { return 'am_chat_fav_' + (S.uid || ''); }
  function getFavs() { try { var a = JSON.parse(localStorage.getItem(favKey()) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function setFavs(a) { try { localStorage.setItem(favKey(), JSON.stringify(a.slice(0, 200))); } catch (e) {} }
  function toggleFav(id) {
    var a = getFavs(), i = a.indexOf(id);
    if (i >= 0) a.splice(i, 1); else a.unshift(id);
    setFavs(a);
  }
  function renderStickers() {
    var box = $('chat-stk');
    var keepScroll = box.querySelector('.stk-body') ? box.querySelector('.stk-body').scrollTop : 0;
    box.textContent = '';
    var ids = Object.keys(S.stickers);
    if (!ids.length) {
      box.appendChild(el('div', 'chat-empty', 'Belum ada stiker. Owner bisa menambahkannya lewat menu Owner → Stiker Chat.'));
      return;
    }
    var packs = {}, order = [];
    ids.sort(function (a, b) { return (S.stickers[a].ts || 0) - (S.stickers[b].ts || 0); }).forEach(function (id) {
      var p = S.stickers[id].pack || 'Stiker';
      if (!packs[p]) { packs[p] = []; order.push(p); }
      packs[p].push(id);
    });
    var favs = getFavs().filter(function (id) { return S.stickers[id]; });
    var tab = S.stkTab;
    if (tab !== 'fav' && !packs[tab]) tab = favs.length ? 'fav' : order[0];
    if (tab === 'fav' && !favs.length && S.stkTab === undefined) tab = order[0];
    S.stkTab = tab;

    // Baris tab: ★ Favorit + satu tab per pack (ikon = stiker pertama pack)
    var tabs = el('div', 'stk-tabs');
    var fb = el('button', 'stk-tab fav' + (tab === 'fav' ? ' on' : '')); fb.type = 'button'; fb.title = 'Favorit'; fb.setAttribute('aria-label', 'Favorit');
    fb.appendChild(icon('star'));
    fb.addEventListener('click', function () { S.stkTab = 'fav'; renderStickers(); });
    tabs.appendChild(fb);
    order.forEach(function (p) {
      var b = el('button', 'stk-tab' + (tab === p ? ' on' : '')); b.type = 'button'; b.title = p; b.setAttribute('aria-label', 'Pack ' + p);
      b.appendChild(stickerNode(packs[p][0]));
      b.addEventListener('click', function () { S.stkTab = p; renderStickers(); });
      tabs.appendChild(b);
    });
    box.appendChild(tabs);

    var body = el('div', 'stk-body');
    var list = tab === 'fav' ? favs : packs[tab];
    body.appendChild(el('h4', null, tab === 'fav' ? 'Favorit (' + favs.length + ')' : tab + ' (' + list.length + ')'));
    if (!list.length) {
      body.appendChild(el('div', 'chat-empty', 'Belum ada favorit. Buka sebuah pack lalu tekan bintang di pojok stiker.'));
    }
    var grid = el('div', 'stk-grid');
    list.forEach(function (id) {
      var cell = el('div', 'stk-cell');
      var b = el('button', 'stk-send'); b.type = 'button'; b.setAttribute('aria-label', 'Kirim stiker');
      b.appendChild(stickerNode(id));
      b.addEventListener('click', function () { sendSticker(id); });
      var isFav = favs.indexOf(id) >= 0;
      var st = el('button', 'stk-fav' + (isFav ? ' on' : '')); st.type = 'button';
      st.setAttribute('aria-label', isFav ? 'Hapus dari favorit' : 'Tambah ke favorit');
      st.appendChild(icon('star'));
      st.addEventListener('click', function (e) { e.stopPropagation(); toggleFav(id); renderStickers(); });
      cell.appendChild(b); cell.appendChild(st);
      grid.appendChild(cell);
    });
    body.appendChild(grid);
    box.appendChild(body);
    body.scrollTop = keepScroll;
  }
  function toggleStickers(force) {
    var box = $('chat-stk'), btn = $('chat-stk-btn');
    var show = force === undefined ? !box.classList.contains('show') : force;
    box.classList.toggle('show', show);
    btn.classList.toggle('on', show);
    if (show) { closeMention(); renderStickers(); }
  }

  // ─── Reply / gambar ───────────────────────────────────────
  function setReply(m) {
    S.reply = m;
    $('chat-reply-name').textContent = 'Membalas ' + (m.name || 'User');
    $('chat-reply-text').textContent = m.text ? m.text.slice(0, 80) : m.st ? '[stiker]' : '[gambar]';
    $('chat-reply').classList.add('show');
    input.focus();
  }
  function clearReply() { S.reply = null; $('chat-reply').classList.remove('show'); }
  function insertMention(u) {
    var v = input.value;
    input.value = (v && !/\s$/.test(v) ? v + ' ' : v) + '@' + u + ' ';
    input.focus(); grow();
  }

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var im = new Image();
      im.onload = function () { URL.revokeObjectURL(url); resolve(im); };
      im.onerror = function () { URL.revokeObjectURL(url); reject(new Error('File bukan gambar yang valid')); };
      im.src = url;
    });
  }
  // Kecilkan & kompres di browser supaya hemat kuota & database (maks ~215 KB)
  function compress(file) {
    return loadImage(file).then(function (im) {
      var w = im.naturalWidth, h = im.naturalHeight;
      var scale = Math.min(1, 1000 / Math.max(w, h));
      for (var round = 0; round < 4; round++) {
        var cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(w * scale)); cv.height = Math.max(1, Math.round(h * scale));
        var cx = cv.getContext('2d');
        cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);   // PNG transparan -> latar putih
        cx.drawImage(im, 0, 0, cv.width, cv.height);
        var qs = [0.82, 0.7, 0.58, 0.46];
        for (var i = 0; i < qs.length; i++) {
          var d = cv.toDataURL('image/jpeg', qs[i]);
          if (d.length * 0.75 <= MAX_IMG_BYTES) return d;
        }
        scale *= 0.72;
      }
      throw new Error('Gambar terlalu besar, pilih gambar lain');
    });
  }
  function setImage(dataUrl) {
    S.img = dataUrl;
    $('chat-prev').classList.toggle('show', !!dataUrl);
    if (dataUrl) {
      $('chat-prev-img').src = dataUrl;
      $('chat-prev-size').textContent = Math.round(dataUrl.length * 0.75 / 1024) + ' KB';
    }
  }
  // ─── Lagu yang diteruskan ke chat ────────────────────────
  function bs() { return window.Backsound || null; }
  function songCard(sg) {
    var card = el('div', 'cm-song'); card.setAttribute('data-url', sg.url);
    var eq = el('span', 'cm-song-eq'); for (var i = 0; i < 4; i++) { var b = el('i'); b.style.setProperty('--i', i); eq.appendChild(b); }
    var play = el('button', 'cm-song-play'); play.type = 'button'; play.setAttribute('aria-label', 'Putar ' + sg.title);
    play.appendChild(el('span', 'cm-song-ic'));
    var tx = el('div', 'cm-song-tx'); tx.appendChild(el('div', 'cm-song-t', sg.title));
    tx.appendChild(el('div', 'cm-song-s', 'Lagu' + (sg.cat ? ' • ' + sg.cat : '')));
    card.appendChild(play); card.appendChild(tx); card.appendChild(eq);
    play.addEventListener('click', function () {
      var B = bs();
      if (B && B.getState && B.getState().track.url === sg.url && B.getState().enabled && (B.getState().playing || B.getState().loading)) { B.toggle(); return; }  // sedang diputar: jeda
      if (!B || !B.playUrl || !B.playUrl(sg.url)) Toast.error('Lagu ini sudah tidak ada di playlist');
    });
    paintSongCard(card, B0());
    return card;
  }
  function B0() { try { return bs() && bs().getState ? bs().getState() : null; } catch (e) { return null; } }
  function paintSongCard(card, st) {
    var cur = !!(st && st.track && st.track.url === card.getAttribute('data-url') && st.enabled);
    card.classList.toggle('playing', cur && !!st.playing);
    card.classList.toggle('loading', cur && !!st.loading);
    card.classList.toggle('current', cur);
  }
  function paintAllSongCards(st) { document.querySelectorAll('.cm-song').forEach(function (c) { paintSongCard(c, st); }); }
  function watchBacksound() {
    try { if (bs() && bs().subscribe) bs().subscribe(paintAllSongCards); } catch (e) { /* abaikan */ }
  }

  // ─── Teruskan lagu: pratinjau sebelum dikirim ─────────────
  function readShare() {
    try { var o = JSON.parse(localStorage.getItem('am_share_song') || 'null'); return o && o.url && Date.now() - (o.ts || 0) < 10 * 60 * 1000 ? o : null; } catch (e) { return null; }
  }
  function checkShare() {
    var o = readShare();
    S.song = o;
    var bar = $('chat-song');
    bar.classList.toggle('show', !!o);
    if (o) { $('chat-song-t').textContent = o.title; input.focus(); }
  }
  function clearShare() { S.song = null; try { localStorage.removeItem('am_share_song'); } catch (e) { /* abaikan */ } $('chat-song').classList.remove('show'); }
  window.AMChat = { checkShare: checkShare };

  function lightbox(src) {
    var box = el('div', 'chat-lightbox'); var im = el('img'); im.src = src; im.alt = '';
    box.appendChild(im); box.addEventListener('click', function () { box.remove(); });
    document.body.appendChild(box);
  }

  // ─── Kirim ────────────────────────────────────────────────
  function setSending(on) { S.sending = on; $('chat-send').disabled = on; $('chat-send').classList.toggle('loading', on); }
  async function post(payload) {
    return AMApp.apiCall('POST', '/api/chat/send', payload);
  }
  async function sendText() {
    // Izin notifikasi browser diminta sekali, saat user menekan kirim (harus dari gestur user)
    try { if ('Notification' in window && Notification.permission === 'default' && !localStorage.getItem('am_notif_asked')) { localStorage.setItem('am_notif_asked', '1'); Notification.requestPermission(); } } catch (e) { /* abaikan */ }
    if (S.sending) return;
    var text = input.value.trim();
    if (!text && !S.img && !S.song) return;
    setSending(true);
    try {
      var payload = { text: text };
      if (S.reply) payload.reply = S.reply.id;
      if (S.song) payload.song = { url: S.song.url };
      if (S.img) {
        var up = await AMApp.apiCall('POST', '/api/chat/upload', { data: S.img }, {}, 30000);
        payload.img = up.data.id;
      }
      await post(payload);
      input.value = ''; grow(); closeMention(); clearReply(); setImage(null); toggleStickers(false); clearShare();
      S.stick = true;
      if (S.mode === 'poll') pollOnce();
    } catch (e) { Toast.error(e.message || 'Gagal mengirim'); }
    finally { setSending(false); }
  }
  async function sendSticker(id) {
    if (S.sending) return;
    setSending(true);
    try {
      var payload = { st: id };
      if (S.reply) payload.reply = S.reply.id;
      await post(payload);
      clearReply(); toggleStickers(false); S.stick = true;
      if (S.mode === 'poll') pollOnce();
    } catch (e) { Toast.error(e.message || 'Gagal mengirim stiker'); }
    finally { setSending(false); }
  }
  async function pinMsg(m) {
    try { await AMApp.apiCall('POST', '/api/chat/pin', { id: m.id }); Toast.success('Pesan dipin'); if (S.mode === 'poll') pollOnce(); }
    catch (e) { Toast.error(e.message); }
  }
  async function unpin() {
    try { await AMApp.apiCall('DELETE', '/api/chat/pin'); if (S.mode === 'poll') pollOnce(); } catch (e) { Toast.error(e.message); }
  }
  function delMsg(m) {
    Utils.createModal('Hapus pesan?', '<div class="text-secondary" style="font-size:.9rem">Pesan ini akan dihapus untuk semua orang.</div>', [
      { label: 'Batal', action: 'close', class: 'btn-secondary' },
      { label: 'Hapus', action: 'ok', class: 'btn-danger', onClick: async function () {
        try { await AMApp.apiCall('DELETE', '/api/chat/message/' + encodeURIComponent(m.id)); removeMsg(m.id); } catch (e) { Toast.error(e.message); }
      } },
    ]);
  }

  // ─── Realtime (Firebase) ──────────────────────────────────
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = function () { reject(new Error('gagal memuat ' + src)); };
      document.head.appendChild(s);
    });
  }
  function setOnline(n, ok) {
    $('chat-online').classList.toggle('off', !ok);
    $('chat-online-n').textContent = ok ? String(Math.max(1, n)) : '-';
  }

  async function startRealtime() {
    if (!(window.firebase && firebase.database)) await loadScript('https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js');
    var cfg = await fetch('/api/firebase-config').then(function (r) { return r.json(); });
    var url = cfg && cfg.data && cfg.data.databaseURL;
    if (!url) throw new Error('databaseURL belum diisi di server (FIREBASE_DATABASE_URL)');
    var db = firebase.app().database(url);
    S.db = db;

    // Stiker dulu (supaya pesan stiker langsung punya tipe file-nya), sekaligus uji izin baca
    var stkRef = db.ref('chat/stickers');
    var first = await stkRef.once('value');       // melempar error kalau Rules menolak
    S.stickers = first.val() || {};
    stkRef.on('value', function (snap) { S.stickers = snap.val() || {}; if ($('chat-stk').classList.contains('show')) renderStickers(); });
    S.unsub.push(function () { stkRef.off(); });

    var q = db.ref('chat/messages').orderByChild('ts').limitToLast(INITIAL);
    var got = 0;
    q.on('child_added', function (snap) { got++; var v = snap.val() || {}; v.id = snap.key; addMsg(v); }, function (err) { throw err; });
    q.on('child_removed', function (snap) { removeMsg(snap.key); });
    S.unsub.push(function () { q.off(); });
    await q.once('value');                        // semua pesan awal sudah masuk
    S.hasMore = got >= INITIAL;
    finishInitial();

    var pinRef = db.ref('chat/pin');
    pinRef.on('value', function (snap) { S.pin = snap.val(); renderPin(); });
    S.unsub.push(function () { pinRef.off(); });

    // Online: setiap user yang membuka chat menulis status miliknya; hilang otomatis saat koneksi putus
    var me = db.ref('chat/presence/' + S.uid);
    db.ref('.info/connected').on('value', function (snap) {
      if (snap.val() === true) {
        me.onDisconnect().remove();
        me.set({ name: S.name.slice(0, 40) || 'User', ts: firebase.database.ServerValue.TIMESTAMP });
      }
    });
    var presRef = db.ref('chat/presence');
    presRef.on('value', function (snap) { setOnline(snap.numChildren(), true); });
    S.unsub.push(function () { presRef.off(); db.ref('.info/connected').off(); me.remove().catch(function () {}); });

    S.mode = 'realtime';
  }

  async function loadOlder() {
    if (!S.db || !S.msgs.length) return;
    var btn = $('chat-more'); if (btn) btn.textContent = 'Memuat...';
    try {
      var snap = await S.db.ref('chat/messages').orderByChild('ts').endAt(S.msgs[0].ts - 1).limitToLast(OLDER).once('value');
      var arr = [];
      snap.forEach(function (c) { var v = c.val() || {}; v.id = c.key; if (!S.byId[v.id]) arr.push(v); });
      arr.forEach(function (m) { S.byId[m.id] = m; });
      S.msgs = arr.concat(S.msgs).sort(function (a, b) { return a.ts - b.ts; });
      S.hasMore = arr.length >= OLDER;
      renderAll();
    } catch (e) { Toast.error('Gagal memuat pesan lama'); }
  }

  // ─── Polling cadangan ─────────────────────────────────────
  var pollTimer = null, polling = false;
  async function pollOnce() {
    if (polling) return; polling = true;
    try {
      var r = await AMApp.apiCall('GET', '/api/chat/state?ping=1&since=' + (S.lastTs || 0));
      var d = r.data || {};
      if (d.stickers) S.stickers = d.stickers;
      (d.messages || []).forEach(addMsg);
      S.pin = d.pin || null; renderPin();
      setOnline(d.online || 1, true);
    } catch (e) { /* coba lagi di putaran berikut */ }
    polling = false;
  }
  async function startPolling() {
    S.mode = 'poll';
    var r = await AMApp.apiCall('GET', '/api/chat/state?ping=1&since=0');
    var d = r.data || {};
    S.stickers = d.stickers || {};
    (d.messages || []).forEach(addMsg);
    S.pin = d.pin || null; renderPin();
    setOnline(d.online || 1, true);
    finishInitial();
    pollTimer = setInterval(function () { if (!document.hidden) pollOnce(); }, POLL_MS);
    S.unsub.push(function () { clearInterval(pollTimer); });
  }

  function finishInitial() {
    S.ready = true;
    renderAll();
    scrollBottom();
    list.addEventListener('scroll', function () { S.stick = nearBottom(); if (S.stick) hideNew(); }, { passive: true });
  }

  // ─── Input ────────────────────────────────────────────────
  // ─── Popup @ (saran user) ─────────────────────────────────
  var MEN = { list: null, loading: false, items: [], idx: 0, start: -1 };
  function loadMembers() {
    if (MEN.list || MEN.loading) return;
    MEN.loading = true;
    AMApp.apiCall('GET', '/api/chat/members').then(function (r) { MEN.list = (r && r.data) || []; }).catch(function () { MEN.list = []; })
      .then(function () { MEN.loading = false; updateMention(); });
  }
  function closeMention() { MEN.start = -1; $('chat-men').classList.remove('show'); }
  function updateMention() {
    var box = $('chat-men');
    var pos = input.selectionStart == null ? input.value.length : input.selectionStart;
    var mm = /(^|\s)@([A-Za-z0-9_.]{0,30})$/.exec(input.value.slice(0, pos));
    if (!mm) { closeMention(); return; }
    MEN.start = pos - mm[2].length - 1;
    if (!MEN.list) { loadMembers(); return; }
    var q = mm[2].toLowerCase();
    var seen = {}; S.msgs.slice(-80).forEach(function (m) { seen[m.uid] = 1; });   // yang baru ngobrol didahulukan
    var res = MEN.list.filter(function (u) {
      if (u.uid === S.uid) return false;
      return !q || u.username.toLowerCase().indexOf(q) === 0 || u.name.toLowerCase().indexOf(q) >= 0 || u.username.toLowerCase().indexOf(q) >= 0;
    }).sort(function (a, b) {
      var pa = a.username.toLowerCase().indexOf(q) === 0 ? 0 : 1, pb = b.username.toLowerCase().indexOf(q) === 0 ? 0 : 1;
      return (pa - pb) || ((seen[b.uid] ? 1 : 0) - (seen[a.uid] ? 1 : 0)) || a.username.localeCompare(b.username);
    }).slice(0, 30);
    var items = [];
    if (isOwner() && (!q || 'semua'.indexOf(q) === 0 || 'all'.indexOf(q) === 0)) items.push({ all: true, username: 'semua' });
    items = items.concat(res);
    if (!items.length) { closeMention(); return; }
    MEN.items = items; MEN.idx = 0; renderMention();
  }
  function renderMention() {
    var box = $('chat-men'); box.textContent = '';
    MEN.items.forEach(function (u, i) {
      var row = el('div', 'men-row' + (i === MEN.idx ? ' on' : ''));
      if (u.all) {
        var ic = el('div', 'cm-ava men-all'); ic.appendChild(icon('users')); row.appendChild(ic);
        var tx = el('div', 'men-tx'); tx.appendChild(el('div', 'men-n', 'semua')); tx.appendChild(el('div', 'men-s', 'Sebut semua anggota di obrolan ini'));
        row.appendChild(tx);
      } else {
        row.appendChild(avatarEl(u.uid, u.name || u.username));
        var t2 = el('div', 'men-tx');
        var l1 = el('div', 'men-n', u.name || u.username);
        var bd = badgeEl(u.role); if (bd && u.role !== 'user') l1.appendChild(bd);
        t2.appendChild(l1); t2.appendChild(el('div', 'men-s', '@' + u.username));
        row.appendChild(t2);
      }
      row.addEventListener('mousedown', function (e) { e.preventDefault(); });
      row.addEventListener('click', function () { pickMention(u); });
      box.appendChild(row);
    });
    box.classList.add('show');
    var on = box.querySelector('.on'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
  }
  function pickMention(u) {
    var pos = input.selectionStart == null ? input.value.length : input.selectionStart;
    var ins = '@' + u.username + ' ';
    input.value = input.value.slice(0, MEN.start) + ins + input.value.slice(pos);
    var np = MEN.start + ins.length;
    closeMention(); input.focus(); try { input.setSelectionRange(np, np); } catch (e) { /* abaikan */ } grow();
  }
  // Tandai notifikasi tag sebagai sudah dibaca (halaman chat = tempat membacanya)
  function clearMyMentions() {
    AMApp.apiCall('POST', '/api/chat/mentions/clear', {}).catch(function () { /* abaikan */ });
    try { var now = String(Date.now()); localStorage.setItem('am_cn_read_' + S.uid, now); localStorage.setItem('am_cn_toast_' + S.uid, now); } catch (e) { /* abaikan */ }
  }

  function grow() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 110) + 'px';
    var n = input.value.length, c = $('chat-count');
    c.textContent = n + '/500'; c.classList.toggle('show', n > 400);
  }

  function bind() {
    input.addEventListener('input', function () { grow(); updateMention(); });
    input.addEventListener('click', updateMention);
    input.addEventListener('keyup', function (e) { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') updateMention(); });
    input.addEventListener('keydown', function (e) {
      if (MEN.start >= 0 && MEN.items.length) {
        if (e.key === 'ArrowDown') { e.preventDefault(); MEN.idx = (MEN.idx + 1) % MEN.items.length; renderMention(); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); MEN.idx = (MEN.idx - 1 + MEN.items.length) % MEN.items.length; renderMention(); return; }
        if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(MEN.items[MEN.idx]); return; }
        if (e.key === 'Escape') { e.preventDefault(); closeMention(); return; }
      }
      // Desktop: Enter kirim, Shift+Enter baris baru. HP: Enter = baris baru (kirim lewat tombol).
      if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer:fine)').matches) { e.preventDefault(); sendText(); }
    });
    input.addEventListener('focus', function () { document.documentElement.classList.add('chat-typing'); toggleStickers(false); setTimeout(function () { if (S.stick) scrollBottom(); }, 250); });
    input.addEventListener('blur', function () { document.documentElement.classList.remove('chat-typing'); });
    // Jangan biarkan tombol mencuri fokus dari kolom ketik: blur memunculkan menu bawah lagi, tata letak bergeser
    // di antara tekan & lepas, dan klik pertama hilang. Dengan ini keyboard HP juga tetap terbuka saat kirim.
    ['chat-send', 'chat-stk-btn', 'chat-img-btn'].forEach(function (id) {
      var b = $(id); b.addEventListener('mousedown', function (e) { e.preventDefault(); }); b.addEventListener('pointerdown', function (e) { if (e.pointerType === 'mouse') e.preventDefault(); });
    });
    $('chat-send').addEventListener('click', sendText);
    $('chat-stk-btn').addEventListener('click', function () { toggleStickers(); });
    $('chat-img-btn').addEventListener('click', function () { $('chat-file').click(); });
    $('chat-file').addEventListener('change', async function (e) {
      var f = e.target.files && e.target.files[0]; e.target.value = '';
      if (!f) return;
      if (!/^image\//.test(f.type)) { Toast.warning('Pilih file gambar'); return; }
      try { setImage(await compress(f)); } catch (err) { Toast.error(err.message); }
    });
    $('chat-reply-x').addEventListener('click', clearReply);
    $('chat-prev-x').addEventListener('click', function () { setImage(null); });
    $('chat-pin-x').addEventListener('click', function (e) { e.stopPropagation(); unpin(); });
    $('chat-pin').addEventListener('click', function () { if (S.pin && S.pin.msgId) jumpTo(S.pin.msgId); });
    $('chat-new').addEventListener('click', function () { scrollBottom(); hideNew(); });
    window.addEventListener('pagehide', function () { S.unsub.forEach(function (f) { try { f(); } catch (e) { /* abaikan */ } }); });
  }

  // ─── Mulai ────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', async function () {
    try { initParticles(); } catch (e) { /* abaikan */ }
    Nav.init('chat');
    list = $('chat-list'); input = $('chat-input');

    var user = null;
    try { user = await Auth.init({ waitProfile: false }); }
    catch (err) { Toast.error(err.message || 'Gagal terhubung. Coba refresh halaman.'); return; }
    if (!user) { window.location.href = '/login'; return; }

    var prof = Auth.userData;
    if (!prof) { try { prof = await Promise.race([Auth.profilePromise, new Promise(function (r) { setTimeout(r, 5000); })]); } catch (e) { prof = null; } }
    prof = prof || Auth.userData || {};
    S.uid = user.uid; S.role = prof.role || 'user';
    S.name = prof.name || user.displayName || 'User'; S.username = prof.username || '';
    if (prof.photoURL && /^data:image\//.test(prof.photoURL)) avaCache[S.uid] = prof.photoURL;

    bind();
    $('chat-song-x').addEventListener('click', clearShare);
    checkShare(); watchBacksound();
    clearMyMentions();
    try {
      await startRealtime();
    } catch (err) {
      console.warn('[chat] Realtime Firebase tidak tersedia, pakai mode cadangan:', err && err.message);
      S.unsub.forEach(function (f) { try { f(); } catch (e) { /* abaikan */ } }); S.unsub = [];
      S.msgs = []; S.byId = {}; S.lastTs = 0; S.ready = false;
      if (isOwner()) Toast.warning('Realtime Firebase belum aktif (cek Rules + FIREBASE_DATABASE_URL). Chat memakai mode cadangan.');
      try { await startPolling(); }
      catch (e2) { list.textContent = ''; list.appendChild(el('div', 'chat-empty', 'Gagal memuat chat: ' + (e2.message || 'coba lagi'))); }
    }
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { clearMyMentions(); if (S.mode === 'poll') pollOnce(); } });
  });

  window.GlobalChat = { state: S };
})();
