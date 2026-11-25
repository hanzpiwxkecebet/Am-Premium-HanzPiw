const test = require('node:test');
const assert = require('node:assert/strict');
const { FakeDb } = require('./helpers');
const { isPremiumExpired, expirePremiumIfNeeded, extendPremium } = require('../server/services/premiumService');
const { maintainEmails, isUsedExpired, USED_RETENTION_MS, LOCK_TTL_MS } = require('../server/services/emailService');

const DAY = 24 * 60 * 60 * 1000;

test('premium: kedaluwarsa hanya untuk role premium yang punya masa aktif lewat', () => {
  const now = 1_000_000_000;
  assert.equal(isPremiumExpired({ role: 'premium', premiumExpiresAt: now - 1 }, now), true);
  assert.equal(isPremiumExpired({ role: 'premium', premiumExpiresAt: now + 1 }, now), false);
  assert.equal(isPremiumExpired({ role: 'premium' }, now), false, 'tanpa masa aktif = permanen (diberi admin)');
  assert.equal(isPremiumExpired({ role: 'admin', premiumExpiresAt: now - 1 }, now), false, 'staff tidak disentuh');
  assert.equal(isPremiumExpired({ role: 'user', premiumExpiresAt: now - 1 }, now), false);
});

test('premium: extendPremium memperpanjang dari sisa masa, bukan menimpa', () => {
  const now = 1_000_000_000;
  assert.equal(extendPremium(0, 30, now), now + 30 * DAY);
  assert.equal(extendPremium(now + 10 * DAY, 30, now), now + 40 * DAY);
  assert.equal(extendPremium(now - 5 * DAY, 30, now), now + 30 * DAY, 'masa lama sudah lewat: mulai dari sekarang');
});

test('premium: expirePremiumIfNeeded menurunkan role di database', async () => {
  const now = Date.now();
  const db = new FakeDb({ users: { u1: { role: 'premium', premiumExpiresAt: now - 1000 }, u2: { role: 'premium', premiumExpiresAt: now + DAY } } });
  const a = await expirePremiumIfNeeded(db, 'u1', await db.ref('users/u1').once('value').then((s) => s.val()), now);
  assert.equal(a.role, 'user');
  assert.equal(db.root.users.u1.role, 'user');
  assert.ok(db.root.users.u1.premiumExpiresAt == null);
  const b = await expirePremiumIfNeeded(db, 'u2', db.root.users.u2, now);
  assert.equal(b.role, 'premium');
});

test('email: terpakai > 7 hari dihapus, < 7 hari tetap "used", lock basi dilepas', async () => {
  const now = 2_000_000_000_000;
  const db = new FakeDb({
    emails: {
      oldUsed:   { email: 'a@x.com', authorized: true, status: 'used', usedAt: now - 7 * DAY - 1 },
      freshUsed: { email: 'b@x.com', authorized: true, status: 'used', usedAt: now - 6 * DAY },
      staleLock: { email: 'c@x.com', authorized: true, status: 'in_use', lockedBy: 'u9', lockedAt: now - LOCK_TTL_MS - 1, lockedRequestId: 'req-1' },
      freshLock: { email: 'd@x.com', authorized: true, status: 'in_use', lockedBy: 'u8', lockedAt: now - 1000 },
      free:      { email: 'e@x.com', authorized: true, status: 'available' },
    },
    usage: { u9: { 'req-1': { status: 'waiting_verification' } } },
  });
  const r = await maintainEmails(db, now);
  assert.deepEqual(r, { purged: 1, released: 1 });
  assert.equal(db.root.emails.oldUsed, undefined, 'email terpakai 7 hari dihapus');
  assert.equal(db.root.emails.freshUsed.status, 'used', 'belum 7 hari: tetap Telah Digunakan');
  assert.equal(db.root.emails.staleLock.status, 'available');
  assert.ok(db.root.emails.staleLock.lockedBy == null);
  assert.equal(db.root.emails.freshLock.status, 'in_use');
  assert.equal(db.root.emails.free.status, 'available');
  assert.equal(db.root.usage.u9['req-1'].status, 'expired');
  // idempotent
  assert.deepEqual(await maintainEmails(db, now), { purged: 0, released: 0 });
});

test('email: batas tepat 7 hari', () => {
  const now = 5_000_000_000_000;
  assert.equal(isUsedExpired({ status: 'used', usedAt: now - USED_RETENTION_MS }, now), true);
  assert.equal(isUsedExpired({ status: 'used', usedAt: now - USED_RETENTION_MS + 1 }, now), false);
  assert.equal(isUsedExpired({ status: 'used' }, now), false, 'tanpa usedAt tidak dihapus');
});

// ─── Playlist backsound ────────────────────────────────────────
const { sanitizePlaylist, readPlaylist } = require('../server/services/playlistService');

test('playlist: kategori dirapikan, duplikat & baris kosong dibuang, "ALL" tidak disimpan', () => {
  const out = sanitizePlaylist([
    { title: '  Lagu A ', url: 'https://x.com/a.mp3', cat: ' sad ' },
    { title: 'Dobel', url: 'https://x.com/a.mp3', cat: 'OLD' },
    { title: '', url: '', cat: 'OLD' },
    { title: '', url: 'http://x.com/b.mp3', cat: 'all' },
  ]);
  assert.deepEqual(out, [
    { title: 'Lagu A', url: 'https://x.com/a.mp3', cat: 'SAD' },
    { title: 'Lagu 2', url: 'http://x.com/b.mp3', cat: '' },
  ]);
});

test('playlist: URL tidak valid / terlalu banyak lagu ditolak, data DB rusak jadi kosong', () => {
  assert.throws(() => sanitizePlaylist([{ title: 'x', url: 'javascript:alert(1)' }]), /URL/);
  assert.throws(() => sanitizePlaylist([{ title: 'x', url: 'https://a b.com/x.mp3' }]), /URL/);
  assert.throws(() => sanitizePlaylist(Array.from({ length: 61 }, (_, i) => ({ url: `https://x.com/${i}.mp3` }))), /Maksimal/);
  assert.throws(() => sanitizePlaylist('bukan array'), /daftar/);
  assert.deepEqual(readPlaylist(null), []);
  assert.deepEqual(readPlaylist([{ url: 'ftp://x' }]), []);
  assert.equal(readPlaylist({ 0: { title: 'A', url: 'https://x.com/a.mp3', cat: 'old' } })[0].cat, 'OLD');
});
// ─── Global Chat ───────────────────────────────────────────────
const chatSvc = require('../server/services/chatService');

test('chat: teks dibersihkan (kontrol, bidi), tidak di-escape HTML, dipotong 500', () => {
  assert.equal(chatSvc.cleanText('  halo ‮ dunia\u0000  '), 'halo  dunia');
  assert.equal(chatSvc.cleanText('<3 & "oke"'), '<3 & "oke"', 'tampil pakai textContent, jadi tidak di-escape');
  assert.equal(chatSvc.cleanText('a\n\n\n\n\nb'), 'a\n\nb');
  assert.equal(chatSvc.cleanText('x'.repeat(900)).length, 500);
  assert.equal(chatSvc.cleanText(null), '');
});

test('chat: data URL gambar divalidasi lewat byte pertama, bukan header', () => {
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40)]);
  const ok = chatSvc.parseImageDataUrl('data:image/jpeg;base64,' + jpeg.toString('base64'));
  assert.equal(ok.mime, 'image/jpeg');
  const fake = Buffer.from('<svg onload=alert(1)></svg>' + ' '.repeat(20));
  assert.equal(chatSvc.parseImageDataUrl('data:image/png;base64,' + fake.toString('base64')), null, 'isi bukan PNG');
  assert.equal(chatSvc.parseImageDataUrl('data:image/svg+xml;base64,AAAA'), null);
  assert.equal(chatSvc.parseImageDataUrl('data:image/jpeg;base64,' + Buffer.concat([jpeg, Buffer.alloc(300 * 1024)]).toString('base64')), null, 'terlalu besar');
  assert.equal(chatSvc.validMediaId('0123456789abcdef'), true);
  assert.equal(chatSvc.validMediaId('../../etc/passwd'), false);
});

test('chat: link stiker dikenali (Telegram, sticker.ly, gambar langsung) dan yang berbahaya ditolak', () => {
  assert.deepEqual(chatSvc.parseStickerLink('https://t.me/addstickers/Cat_Pack'), { type: 'telegram', name: 'Cat_Pack' });
  assert.deepEqual(chatSvc.parseStickerLink('tg://addstickers?set=Cat_Pack'), { type: 'telegram', name: 'Cat_Pack' });
  assert.deepEqual(chatSvc.parseStickerLink('sticker.ly/s/ABC123'), { type: 'stickerly', code: 'ABC123', url: 'https://sticker.ly/s/ABC123' });
  assert.equal(chatSvc.parseStickerLink('https://cdn.example.com/a/b.webp').type, 'direct');
  assert.equal(chatSvc.parseStickerLink('http://127.0.0.1/x.png'), null);
  assert.equal(chatSvc.parseStickerLink('https://10.0.0.5/x.png'), null);
  assert.equal(chatSvc.parseStickerLink('https://evil.com/page'), null);
  assert.equal(chatSvc.isSafePublicUrl('https://localhost/x.png'), false);
  assert.equal(chatSvc.isSafePublicUrl('https://user:pw@example.com/x.png'), false);
  assert.equal(chatSvc.isSafePublicUrl('https://[::1]/x.png'), false);
});

test('chat: gambar stiker sticker.ly diambil dari HTML, urut, pack yang cocok kodenya dipilih', () => {
  const u = (code, n) => `https://stickerly.pstatic.net/sticker_pack/AAA/${code}/2/uuid-${String(n).padStart(3, '0')}.png`;
  const html = `<title>Kucing Lucu - Sticker.ly</title>
    <img src="${u('OTHER1', 0)}"><img src="${u('WTKUQD', 2)}"><img src="${u('WTKUQD', 0)}"><img src="${u('WTKUQD', 1)}"><img src="${u('WTKUQD', 1)}">
    <script>{"x":"${u('WTKUQD', 3).replace(/\//g, '\\/')}"}</script>`;
  const r = chatSvc.extractStickerly(html, 'WTKUQD');
  assert.equal(r.name, 'Kucing Lucu');
  assert.deepEqual(r.urls, [0, 1, 2, 3].map((n) => u('WTKUQD', n)));
  assert.deepEqual(chatSvc.extractStickerly('<html></html>', 'X').urls, []);
});

test('ticker: label + maks 5 teks, teks kosong diabaikan, data rusak aman', () => {
  const { sanitizeTicker, readTicker } = require('../server/services/tickerService');
  const t = sanitizeTicker({ enabled: true, label: '  Welcome  ', items: ['a', '', '  b  ', 'c'] });
  assert.deepEqual(t, { enabled: true, label: 'Welcome', items: ['a', 'b', 'c'] });
  assert.equal(sanitizeTicker({ items: [] }).label, 'PENGUMUMAN');
  assert.equal(sanitizeTicker({ label: 'x'.repeat(40), items: ['y'.repeat(500)] }).items[0].length, 240);
  assert.throws(() => sanitizeTicker({ items: ['1', '2', '3', '4', '5', '6'] }), /Maksimal 5/);
  assert.deepEqual(readTicker('rusak'), { enabled: true, label: 'PENGUMUMAN', items: [] });
  assert.equal(sanitizeTicker({ enabled: false, items: ['a'] }).enabled, false);
});
