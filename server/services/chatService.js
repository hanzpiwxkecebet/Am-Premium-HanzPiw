// Helper murni untuk Global Chat (tanpa database) — mudah dites.
const MAX_TEXT = 500;
const MAX_IMAGE_BYTES = 230 * 1024;     // gambar chat (sudah dikecilkan di browser)
const MAX_STICKER_BYTES = 300 * 1024;   // satu stiker
const MAX_STICKERS = 2000;              // total stiker di semua pack
const KEEP_MESSAGES = 400;              // pesan lama dibuang otomatis

// Hapus karakter kontrol & pengatur arah teks (bidi) yang bisa dipakai menipu tampilan; teks disimpan apa adanya
// (TIDAK di-escape HTML) karena klien menampilkannya dengan textContent, bukan innerHTML.
function cleanText(s) {
  return String(s == null ? '' : s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩﻿]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .substring(0, MAX_TEXT);
}

// Deteksi tipe file dari byte pertama (jangan percaya header / ekstensi)
function sniffMime(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.toString('ascii', 0, 4) === 'GIF8') return 'image/gif';
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'video/webm';
  return null;
}

// data URL gambar chat -> { mime, buf } atau null. Hanya jpeg/png/webp, isi harus cocok dengan tipenya.
function parseImageDataUrl(str, maxBytes = MAX_IMAGE_BYTES) {
  if (typeof str !== 'string' || str.length > Math.ceil(maxBytes * 1.4) + 64) return null;
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(str);
  if (!m) return null;
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length || buf.length > maxBytes) return null;
  if (sniffMime(buf) !== m[1]) return null;
  return { mime: m[1], buf };
}

const ID_RE = /^[a-f0-9]{16}$/;
function validMediaId(id) { return typeof id === 'string' && ID_RE.test(id); }

// ─── Link stiker ─────────────────────────────────────────────
const TG_NAME_RE = /^[A-Za-z0-9_]{1,64}$/;
function parseStickerLink(input) {
  const raw = String(input || '').trim();
  if (!raw || raw.length > 600) return null;
  let m = /^tg:\/\/addstickers\?set=([A-Za-z0-9_]{1,64})$/i.exec(raw);
  if (m) return { type: 'telegram', name: m[1] };
  let u;
  try { u = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : 'https://' + raw); } catch (e) { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  if (host === 't.me' || host === 'telegram.me' || host === 'telegram.dog') {
    m = /^\/addstickers\/([A-Za-z0-9_]{1,64})\/?$/.exec(u.pathname);
    return m ? { type: 'telegram', name: m[1] } : null;
  }
  if (host === 'sticker.ly') {
    m = /^\/s\/([A-Za-z0-9]{3,16})\/?$/.exec(u.pathname);
    return m ? { type: 'stickerly', code: m[1], url: 'https://sticker.ly/s/' + m[1] } : null;
  }
  if (/\.(png|webp|gif|jpe?g)$/i.test(u.pathname) && isSafePublicUrl(u.toString())) return { type: 'direct', url: u.toString() };
  return null;
}

// Cegah SSRF: hanya https, bukan IP / localhost / jaringan internal
function isSafePublicUrl(str) {
  let u;
  try { u = new URL(str); } catch (e) { return false; }
  if (u.protocol !== 'https:') return false;
  const h = u.hostname.toLowerCase();
  if (!h.includes('.') || h === 'localhost' || /\.(local|internal|localhost|lan|home|corp)$/.test(h)) return false;
  if (/^[0-9.]+$/.test(h) || h.includes(':') || h.startsWith('[')) return false;   // IPv4 / IPv6 literal
  if (u.username || u.password) return false;
  return true;
}

// Ambil URL gambar stiker dari HTML halaman pack sticker.ly (CDN: stickerly.pstatic.net)
function extractStickerly(html, code) {
  const src = String(html || '').replace(/\\u002F/gi, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&');
  const re = /https:\/\/stickerly\.pstatic\.net\/sticker_pack\/([A-Za-z0-9_-]+)\/([A-Za-z0-9]+)\/(\d+)\/([A-Za-z0-9-]+?)(?:-(\d{1,4}))?\.(png|webp)/g;
  const groups = new Map();
  let m;
  while ((m = re.exec(src))) {
    const key = m[1] + '/' + m[2];
    if (!groups.has(key)) groups.set(key, { code: m[2], items: new Map() });
    const file = m[0];
    if (!groups.get(key).items.has(file)) groups.get(key).items.set(file, m[5] == null ? 9999 : Number(m[5]));
  }
  if (!groups.size) return { name: '', urls: [] };
  let best = null;
  for (const g of groups.values()) {
    if (code && g.code.toUpperCase() === String(code).toUpperCase()) { best = g; break; }
    if (!best || g.items.size > best.items.size) best = g;
  }
  const urls = [...best.items.entries()].sort((a, b) => a[1] - b[1]).map((e) => e[0]);
  const t = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(src) || /<title>([^<]+)<\/title>/i.exec(src);
  const name = t ? t[1].replace(/\s*[-|–].*$/, '').trim().substring(0, 40) : '';
  return { name, urls };
}

function cleanPackName(s, fallback) {
  const v = String(s || '').replace(/[\u0000-\u001F<>]/g, '').trim().substring(0, 40);
  return v || fallback || 'Stiker';
}

// Potongan teks untuk kutipan reply / pin
function snippet(msg, max = 80) {
  if (!msg) return '';
  if (msg.text) return String(msg.text).replace(/\s+/g, ' ').substring(0, max);
  if (msg.song) return '[lagu] ' + String(msg.song.title || '').substring(0, max - 7);
  if (msg.st) return '[stiker]';
  if (msg.img) return '[gambar]';
  return '';
}

// @username di dalam teks. Mengembalikan { handles: [maks 5, huruf kecil], all: bool } (@semua / @all)
function extractMentions(text) {
  const out = { handles: [], all: false };
  const re = /(^|[^A-Za-z0-9_.])@([A-Za-z0-9_.]{2,30})(?![A-Za-z0-9_])/g;
  let m;
  while ((m = re.exec(String(text || '')))) {
    const h = m[2].toLowerCase().replace(/\.+$/, '');
    if (h === 'semua' || h === 'all' || h === 'everyone') out.all = true;
    else if (h && !out.handles.includes(h) && out.handles.length < 5) out.handles.push(h);
  }
  return out;
}

module.exports = {
  extractMentions,
  MAX_TEXT, MAX_IMAGE_BYTES, MAX_STICKER_BYTES, MAX_STICKERS, KEEP_MESSAGES,
  cleanText, sniffMime, parseImageDataUrl, validMediaId, parseStickerLink, isSafePublicUrl,
  extractStickerly, cleanPackName, snippet,
};
