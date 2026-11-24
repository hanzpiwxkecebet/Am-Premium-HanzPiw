// Global Chat. Pesan DITULIS lewat server (validasi, rate limit, role); DIBACA klien langsung dari Firebase
// secara realtime (rules: chat/* hanya baca). Kalau realtime tidak tersedia, klien memakai GET /state (polling).
const crypto = require('crypto');
const axios = require('axios');
const { getDb } = require('../config/firebase');
const chat = require('../services/chatService');

const ONLINE_WINDOW_MS = 45 * 1000;

function newId() { return crypto.randomBytes(8).toString('hex'); }
function fail(res, status, message) { return res.status(status).json({ success: false, message }); }
const isStaff = (role) => role === 'moderator' || role === 'admin' || role === 'owner';

// username jarang berubah: simpan di memori instance
const nameCache = new Map();
async function getIdentity(db, user) {
  const hit = nameCache.get(user.uid);
  if (hit && Date.now() - hit.t < 10 * 60 * 1000) return hit.v;
  const [name, username] = await Promise.all([
    db.ref(`users/${user.uid}/name`).once('value').then((s) => s.val()),
    db.ref(`users/${user.uid}/username`).once('value').then((s) => s.val()),
  ]);
  const v = { name: String(name || user.name || 'User').substring(0, 40), username: String(username || '').substring(0, 30) };
  if (nameCache.size > 500) nameCache.clear();
  nameCache.set(user.uid, { t: Date.now(), v });
  return v;
}

// ─── Pesan ───────────────────────────────────────────────────
async function sendMessage(req, res) {
  const db = getDb();
  const { reply, img, st } = req.body || {};
  const text = chat.cleanText(req.body && req.body.text);
  if (!text && !img && !st) return fail(res, 400, 'Pesan kosong');
  if ((img && st) || ((img || st) && text.length > 200)) return fail(res, 400, 'Kirim gambar/stiker dengan teks singkat saja');

  const ident = await getIdentity(db, req.user);
  const msg = { uid: req.user.uid, name: ident.name, username: ident.username, role: req.user.role || 'user', ts: Date.now() };
  if (text) msg.text = text;

  if (img) {
    if (!chat.validMediaId(img)) return fail(res, 400, 'Gambar tidak valid');
    const m = await db.ref(`chatMedia/${img}/uid`).once('value');
    if (m.val() !== req.user.uid) return fail(res, 400, 'Gambar tidak ditemukan, unggah ulang');
    msg.img = img;
  }
  if (st) {
    if (!chat.validMediaId(st)) return fail(res, 400, 'Stiker tidak valid');
    const m = await db.ref(`chat/stickers/${st}/m`).once('value');
    if (!m.exists()) return fail(res, 400, 'Stiker tidak ditemukan');
    msg.st = st;
  }
  if (reply) {
    const rs = await db.ref(`chat/messages/${String(reply).replace(/[.#$\[\]\/]/g, '')}`).once('value');
    const r = rs.val();
    if (r) msg.reply = { id: rs.key, uid: r.uid, name: r.name, text: chat.snippet(r) };
  }

  const ref = db.ref('chat/messages').push();
  await ref.set(msg);
  // Notifikasi HANYA untuk yang di-tag (@username) atau @semua (khusus owner). Pesan biasa tidak membuat notifikasi.
  // Ditunggu (bukan fire-and-forget) karena di Vercel proses dihentikan begitu balasan terkirim.
  if (text) { try { await notifyMentions(db, req.user, ident, msg, ref.key); } catch (e) { console.warn('[chat] notif gagal:', e.message); } }
  trimOld(db).catch(() => {});
  return res.json({ success: true, data: { id: ref.key, ts: msg.ts } });
}

async function notifyMentions(db, user, ident, msg, msgId) {
  const men = chat.extractMentions(msg.text);
  const note = { from: ident.name, role: msg.role, text: chat.snippet(msg, 90), ts: msg.ts };
  const updates = {};
  if (men.all && user.role === 'owner') {
    // satu catatan untuk semua orang (tanpa menulis ke tiap user)
    updates['chat/allMention'] = { id: msgId, uid: user.uid, ...note };
  }
  if (men.handles.length) {
    const uids = await Promise.all(men.handles.map((h) => db.ref(`usernames/${h}/uid`).once('value').then((s) => s.val()).catch(() => null)));
    uids.forEach((uid) => {
      if (typeof uid === 'string' && /^[A-Za-z0-9_-]{2,128}$/.test(uid) && uid !== user.uid) updates[`chatMentions/${uid}/${msgId}`] = note;
    });
  }
  if (Object.keys(updates).length) await db.ref('/').update(updates);
}

// ─── Daftar anggota (untuk popup @) + notifikasi tag ─────────
let membersCache = { t: 0, v: [] };
async function getMembers(req, res) {
  if (Date.now() - membersCache.t > 60 * 1000) {
    const all = (await getDb().ref('users').once('value')).val() || {};
    membersCache = {
      t: Date.now(),
      v: Object.keys(all).map((uid) => {
        const u = all[uid] || {};
        return { uid, name: String(u.name || '').substring(0, 40), username: String(u.username || ''), role: u.role || 'user', banned: u.status === 'banned' };
      }).filter((u) => u.username && !u.banned).map(({ banned, ...u }) => u).slice(0, 1500),
    };
  }
  res.set('Cache-Control', 'private, max-age=30');
  return res.json({ success: true, data: membersCache.v });
}

async function getMentions(req, res) {
  const db = getDb();
  const [mine, all] = await Promise.all([
    db.ref(`chatMentions/${req.user.uid}`).once('value'),
    db.ref('chat/allMention').once('value'),
  ]);
  const items = [];
  mine.forEach((c) => { items.push({ id: c.key, ...c.val() }); });
  items.sort((a, b) => a.ts - b.ts);
  const a = all.val();
  return res.json({ success: true, data: { items: items.slice(-30), all: a && a.uid !== req.user.uid ? a : null } });
}

async function clearMentions(req, res) {
  await getDb().ref(`chatMentions/${req.user.uid}`).remove();
  return res.json({ success: true });
}

// Buang pesan lama (+ media-nya) supaya database tidak membengkak. Dijalankan acak, tidak menahan balasan.
async function trimOld(db) {
  if (Math.random() > 0.12) return;
  const snap = await db.ref('chat/messages').orderByChild('ts').limitToLast(chat.KEEP_MESSAGES + 60).once('value');
  const all = [];
  snap.forEach((c) => { all.push({ id: c.key, img: c.val().img }); });
  const extra = all.length - chat.KEEP_MESSAGES;
  if (extra <= 0) return;
  const updates = {};
  all.slice(0, extra).forEach((m) => {
    updates[`chat/messages/${m.id}`] = null;
    if (m.img) updates[`chatMedia/${m.img}`] = null;
  });
  await db.ref('/').update(updates);
}

async function deleteMessage(req, res) {
  const db = getDb();
  const id = String(req.params.id || '').replace(/[.#$\[\]\/]/g, '');
  if (!id) return fail(res, 400, 'ID pesan tidak valid');
  const snap = await db.ref(`chat/messages/${id}`).once('value');
  const m = snap.val();
  if (!m) return res.json({ success: true });
  if (m.uid !== req.user.uid && !isStaff(req.user.role)) return fail(res, 403, 'Kamu hanya bisa menghapus pesanmu sendiri');
  const updates = { [`chat/messages/${id}`]: null };
  if (m.img) updates[`chatMedia/${m.img}`] = null;
  const pin = (await db.ref('chat/pin/msgId').once('value')).val();
  if (pin === id) updates['chat/pin'] = null;
  await db.ref('/').update(updates);
  return res.json({ success: true });
}

// ─── Pin ─────────────────────────────────────────────────────
async function setPin(req, res) {
  const db = getDb();
  const ident = await getIdentity(db, req.user);
  const pin = { name: ident.name, role: req.user.role, ts: Date.now() };
  const id = req.body && req.body.id ? String(req.body.id).replace(/[.#$\[\]\/]/g, '') : '';
  if (id) {
    const m = (await db.ref(`chat/messages/${id}`).once('value')).val();
    if (!m) return fail(res, 404, 'Pesan tidak ditemukan');
    pin.msgId = id;
    pin.name = m.name; pin.role = m.role;
    pin.text = chat.snippet(m, 200);
    if (m.img) pin.img = m.img;
    if (m.st) pin.st = m.st;
  } else {
    const text = chat.cleanText(req.body && req.body.text).substring(0, 200);
    if (!text) return fail(res, 400, 'Teks pin kosong');
    pin.text = text;
  }
  await db.ref('chat/pin').set(pin);
  return res.json({ success: true });
}
async function clearPin(req, res) {
  await getDb().ref('chat/pin').set(null);
  return res.json({ success: true });
}

// ─── Gambar chat ─────────────────────────────────────────────
async function uploadImage(req, res) {
  const parsed = chat.parseImageDataUrl(req.body && req.body.data);
  if (!parsed) return fail(res, 400, 'Gambar tidak valid atau terlalu besar (maks ~230 KB, JPG/PNG/WebP)');
  const id = newId();
  await getDb().ref(`chatMedia/${id}`).set({ d: parsed.buf.toString('base64'), m: parsed.mime, uid: req.user.uid, ts: Date.now() });
  return res.json({ success: true, data: { id } });
}

async function serveBlob(node, req, res) {
  const id = req.params.id;
  if (!chat.validMediaId(id)) return res.status(404).end();
  const snap = await getDb().ref(`${node}/${id}`).once('value');
  const v = snap.val();
  if (!v || !v.d) return res.status(404).end();
  res.set('Content-Type', v.m || 'application/octet-stream');
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.set('X-Content-Type-Options', 'nosniff');
  return res.send(Buffer.from(v.d, 'base64'));
}
const serveMedia = (req, res) => serveBlob('chatMedia', req, res);
const serveSticker = (req, res) => serveBlob('chatSticker', req, res);

// ─── Avatar (thumbnail 64px) ─────────────────────────────────
async function getAvatars(req, res) {
  const uids = String(req.query.uids || '').split(',').map((s) => s.trim()).filter((s) => /^[A-Za-z0-9_-]{6,128}$/.test(s)).slice(0, 30);
  const db = getDb();
  const out = {};
  await Promise.all(uids.map(async (uid) => {
    const v = (await db.ref(`userThumbs/${uid}`).once('value')).val();
    out[uid] = typeof v === 'string' && /^data:image\//.test(v) ? v : '';
  }));
  res.set('Cache-Control', 'private, max-age=300');
  return res.json({ success: true, data: out });
}

// ─── Cadangan tanpa realtime: polling ────────────────────────
// Dipakai klien kalau Firebase realtime gagal (rules belum dipasang / blokir jaringan).
async function getState(req, res) {
  const db = getDb();
  const since = Number(req.query.since) || 0;
  const now = Date.now();
  if (req.query.ping === '1') {
    const ident = await getIdentity(db, req.user);
    db.ref(`chat/presence/${req.user.uid}`).set({ name: ident.name, ts: now }).catch(() => {});
  }
  let q = db.ref('chat/messages').orderByChild('ts');
  q = since > 0 ? q.startAt(since + 1).limitToLast(100) : q.limitToLast(60);
  const [msgs, pin, stk, pres] = await Promise.all([
    q.once('value'), db.ref('chat/pin').once('value'),
    since > 0 && req.query.stk !== '1' ? Promise.resolve(null) : db.ref('chat/stickers').once('value'),
    db.ref('chat/presence').once('value'),
  ]);
  const messages = [];
  msgs.forEach((c) => { messages.push({ id: c.key, ...c.val() }); });
  let online = 0;
  const stale = [];
  pres.forEach((c) => {
    const ts = (c.val() && c.val().ts) || 0;
    if (now - ts < ONLINE_WINDOW_MS) online++;
    else if (now - ts > 10 * 60 * 1000) stale.push(c.key);
  });
  stale.slice(0, 20).forEach((k) => db.ref(`chat/presence/${k}`).remove().catch(() => {}));
  return res.json({ success: true, data: { messages, pin: pin.val() || null, stickers: stk ? (stk.val() || {}) : undefined, online, now } });
}

// ─── Stiker (owner) ──────────────────────────────────────────
function tgApi(method, params) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) { const e = new Error('TELEGRAM_BOT_TOKEN belum diisi di environment server. Buat bot lewat @BotFather lalu isi token-nya.'); e.status = 400; throw e; }
  return axios.get(`https://api.telegram.org/bot${token}/${method}`, { params, timeout: 8000 })
    .then((r) => r.data.result)
    .catch((err) => {
      if (err.status) throw err;
      const e = new Error(err.response && err.response.status === 400 ? 'Pack stiker Telegram tidak ditemukan' : 'Gagal menghubungi Telegram');
      e.status = 400; throw e;
    });
}
async function tgDownload(fileId) {
  const file = await tgApi('getFile', { file_id: fileId });
  const r = await axios.get(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`, {
    responseType: 'arraybuffer', timeout: 10000, maxContentLength: chat.MAX_STICKER_BYTES,
  });
  return Buffer.from(r.data);
}
async function downloadUrl(url) {
  if (!chat.isSafePublicUrl(url)) throw new Error('URL tidak aman');
  const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000, maxContentLength: chat.MAX_STICKER_BYTES, maxRedirects: 2,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AMPremiumBot/2.0)' } });
  return Buffer.from(r.data);
}

// Satu panggilan memproses maksimal BATCH stiker (batas waktu serverless); klien mengulang sampai selesai.
const BATCH = 8;
async function importStickers(req, res) {
  const db = getDb();
  const offset = Math.max(0, parseInt(req.body && req.body.offset, 10) || 0);
  let items = [];     // [{ key, fetch: async () => Buffer }]
  let pack = '';
  let total = 0;

  try {
    const urls = Array.isArray(req.body && req.body.urls) ? req.body.urls.map(String).slice(0, 200) : null;
    if (urls) {
      pack = chat.cleanPackName(req.body.pack, 'Custom');
      const ok = urls.filter((u) => chat.isSafePublicUrl(u));
      total = ok.length;
      items = ok.slice(offset, offset + BATCH).map((u) => ({ key: u, fetch: () => downloadUrl(u) }));
    } else {
      const link = chat.parseStickerLink(req.body && req.body.link);
      if (!link) return fail(res, 400, 'Link tidak dikenali. Pakai link pack Telegram (t.me/addstickers/NAMA), sticker.ly (sticker.ly/s/KODE), atau link gambar langsung.');
      if (link.type === 'telegram') {
        const set = await tgApi('getStickerSet', { name: link.name });
        pack = chat.cleanPackName(req.body.pack || set.title, link.name);
        const list = set.stickers || [];
        total = list.length;
        items = list.slice(offset, offset + BATCH).map((s) => {
          // .tgs (animasi Lottie) tidak bisa diputar di browser biasa: pakai gambar pratinjau statisnya
          const useThumb = s.is_animated || (s.is_video && s.file_size > chat.MAX_STICKER_BYTES);
          const fid = useThumb && s.thumbnail ? s.thumbnail.file_id : s.file_id;
          const unique = useThumb && s.thumbnail ? (s.thumbnail.file_unique_id || fid) : s.file_unique_id;
          return { key: 'tg:' + unique, skip: useThumb && !s.thumbnail, fetch: () => tgDownload(fid) };
        });
      } else if (link.type === 'stickerly') {
        const page = await axios.get(link.url, { timeout: 10000, maxContentLength: 3 * 1024 * 1024, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AMPremiumBot/2.0)', 'Accept-Language': 'en' } });
        const found = chat.extractStickerly(page.data, link.code);
        if (!found.urls.length) return fail(res, 400, 'Stiker tidak ditemukan di halaman itu. Buka pack-nya di browser, salin link gambar stikernya, lalu tempel di kolom "link gambar langsung".');
        pack = chat.cleanPackName(req.body.pack || found.name, 'Sticker.ly');
        total = found.urls.length;
        items = found.urls.slice(offset, offset + BATCH).map((u) => ({ key: u, fetch: () => downloadUrl(u) }));
      } else {
        pack = chat.cleanPackName(req.body.pack, 'Custom');
        total = 1;
        items = offset === 0 ? [{ key: link.url, fetch: () => downloadUrl(link.url) }] : [];
      }
    }
  } catch (err) {
    return fail(res, err.status || 502, err.message || 'Gagal membaca pack stiker');
  }

  const existing = (await db.ref('chat/stickers').once('value')).val() || {};
  const have = new Set(Object.values(existing).map((s) => s.src));
  let count = Object.keys(existing).length;
  let added = 0, skipped = 0;
  const updates = {};
  const srcHash = (k) => crypto.createHash('sha1').update(k).digest('hex').slice(0, 20);

  for (const it of items) {
    const h = srcHash(it.key);
    if (it.skip || have.has(h) || count >= chat.MAX_STICKERS) { skipped++; continue; }
    try {
      const buf = await it.fetch();
      const mime = chat.sniffMime(buf);
      if (!mime || buf.length > chat.MAX_STICKER_BYTES) { skipped++; continue; }
      const id = newId();
      updates[`chatSticker/${id}`] = { d: buf.toString('base64'), m: mime };
      updates[`chat/stickers/${id}`] = { pack, m: mime, ts: Date.now(), src: h };
      have.add(h); count++; added++;
    } catch (e) { skipped++; }
  }
  if (added) await db.ref('/').update(updates);
  const next = offset + BATCH;
  return res.json({ success: true, data: { pack, added, skipped, total, next: next < total ? next : null, done: next >= total } });
}

async function listStickers(req, res) {
  const v = (await getDb().ref('chat/stickers').once('value')).val() || {};
  return res.json({ success: true, data: v });
}

async function deleteSticker(req, res) {
  const id = req.params.id;
  if (!chat.validMediaId(id)) return fail(res, 400, 'ID stiker tidak valid');
  await getDb().ref('/').update({ [`chat/stickers/${id}`]: null, [`chatSticker/${id}`]: null });
  return res.json({ success: true });
}
async function deletePack(req, res) {
  const pack = String(req.params.pack || '');
  const db = getDb();
  const all = (await db.ref('chat/stickers').once('value')).val() || {};
  const updates = {};
  Object.keys(all).forEach((id) => { if (all[id].pack === pack) { updates[`chat/stickers/${id}`] = null; updates[`chatSticker/${id}`] = null; } });
  if (Object.keys(updates).length) await db.ref('/').update(updates);
  return res.json({ success: true, data: { removed: Object.keys(updates).length / 2 } });
}

module.exports = { getMembers, getMentions, clearMentions, sendMessage, deleteMessage, setPin, clearPin, uploadImage, serveMedia, serveSticker, getAvatars, getState, importStickers, listStickers, deleteSticker, deletePack };
