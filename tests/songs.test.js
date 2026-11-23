const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { FakeDb, install, mockRes } = require('./helpers');

const state = install();
const S = require('../server/services/songService');
const { startUpload, uploadChunk, finishUpload, streamSong, orphanCleanupUpdates } = require('../server/controllers/songController');
const { sanitizePlaylist } = require('../server/services/playlistService');

const owner = { uid: 'o1', role: 'owner' };
// Response palsu yang juga mendukung send/end/status/set
function res2() {
  const r = mockRes();
  r.send = (b) => { r.sent = b; return r; };
  r.end = () => r;
  r.set = (k, v) => { if (typeof k === 'object') Object.assign(r.headers, k); else r.headers[k] = v; return r; }; // seperti Express
  return r;
}
const mp3 = (n) => { const b = crypto.randomBytes(n); b[0] = 0x49; b[1] = 0x44; b[2] = 0x33; return b; }; // "ID3"

async function upload(buf, name = 'Lagu_Satu.mp3') {
  const r1 = res2();
  await startUpload({ user: owner, body: { name, size: buf.length } }, r1);
  assert.equal(r1.statusCode, 200);
  const { id, chunkSize, chunks } = r1.body.data;
  for (let i = 0; i < chunks; i++) {
    const r = res2();
    await uploadChunk({ user: owner, body: { id, index: i, data: buf.subarray(i * chunkSize, (i + 1) * chunkSize).toString('base64') } }, r);
    assert.equal(r.statusCode, 200, r.body && r.body.message);
  }
  const rf = res2();
  await finishUpload({ user: owner, body: { id } }, rf);
  return { id, rf };
}

test('lagu: upload multi-potongan lalu diputar utuh & per Range sama persis dengan file asli', async () => {
  state.db = new FakeDb();
  const buf = mp3(S.CHUNK_SIZE * 2 + 12345); // 3 potongan
  const { id, rf } = await upload(buf);
  assert.equal(rf.statusCode, 200, rf.body && rf.body.message);
  assert.equal(rf.body.data.url, `/api/public/song/${id}`);
  assert.equal(rf.body.data.title, 'Lagu Satu');
  assert.equal(rf.body.data.type, 'audio/mpeg');

  const full = res2();
  await streamSong({ params: { id }, headers: {} }, full);
  assert.equal(full.statusCode, 200);
  assert.equal(full.headers['Content-Type'], 'audio/mpeg');
  assert.equal(full.headers['Accept-Ranges'], 'bytes');
  assert.ok(Buffer.compare(full.sent, buf) === 0, 'isi utuh sama');

  // Range yang melintasi batas potongan
  const a = S.CHUNK_SIZE - 100, b = S.CHUNK_SIZE + 200;
  const part = res2();
  await streamSong({ params: { id }, headers: { range: `bytes=${a}-${b}` } }, part);
  assert.equal(part.statusCode, 206);
  assert.equal(part.headers['Content-Range'], `bytes ${a}-${b}/${buf.length}`);
  assert.ok(Buffer.compare(part.sent, buf.subarray(a, b + 1)) === 0);

  const tail = res2();
  await streamSong({ params: { id }, headers: { range: 'bytes=-500' } }, tail);
  assert.ok(Buffer.compare(tail.sent, buf.subarray(buf.length - 500)) === 0);

  const bad = res2();
  await streamSong({ params: { id }, headers: { range: `bytes=${buf.length + 5}-` } }, bad);
  assert.equal(bad.statusCode, 416);
});

test('lagu: file besar tanpa Range dipotong ke batas respons (206), sisanya diminta lanjut', async () => {
  state.db = new FakeDb();
  const buf = mp3(S.MAX_RESPONSE_BYTES + 50000);
  const { id } = await upload(buf);
  const r = res2();
  await streamSong({ params: { id }, headers: {} }, r);
  assert.equal(r.statusCode, 206);
  assert.equal(r.sent.length, S.MAX_RESPONSE_BYTES);
  assert.equal(r.headers['Content-Range'], `bytes 0-${S.MAX_RESPONSE_BYTES - 1}/${buf.length}`);
});

test('lagu: file bukan audio ditolak & datanya dibersihkan; file terlalu besar ditolak', async () => {
  state.db = new FakeDb();
  const txt = Buffer.alloc(4000, 'a');
  const { id, rf } = await upload(txt, 'palsu.mp3');
  assert.equal(rf.statusCode, 400);
  assert.equal(state.db.root.songMeta, undefined);
  assert.equal(state.db.root.songData, undefined);

  const big = res2();
  await startUpload({ user: owner, body: { name: 'x.mp3', size: S.MAX_SONG_BYTES + 1 } }, big);
  assert.equal(big.statusCode, 400);
});

test('lagu: potongan dengan ukuran/ID/nomor salah ditolak, finish gagal kalau ada potongan hilang', async () => {
  state.db = new FakeDb();
  const buf = mp3(S.CHUNK_SIZE + 5000);
  const r1 = res2();
  await startUpload({ user: owner, body: { name: 'a.mp3', size: buf.length } }, r1);
  const { id } = r1.body.data;
  const wrongSize = res2();
  await uploadChunk({ user: owner, body: { id, index: 0, data: buf.subarray(0, 1000).toString('base64') } }, wrongSize);
  assert.equal(wrongSize.statusCode, 400);
  const badIdx = res2();
  await uploadChunk({ user: owner, body: { id, index: 9, data: 'AAAA' } }, badIdx);
  assert.equal(badIdx.statusCode, 400);
  const badId = res2();
  await uploadChunk({ user: owner, body: { id: '../../x', index: 0, data: 'AAAA' } }, badId);
  assert.equal(badId.statusCode, 400);
  const ok0 = res2();
  await uploadChunk({ user: owner, body: { id, index: 0, data: buf.subarray(0, S.CHUNK_SIZE).toString('base64') } }, ok0);
  assert.equal(ok0.statusCode, 200);
  const fin = res2();
  await finishUpload({ user: owner, body: { id } }, fin);
  assert.equal(fin.statusCode, 400, 'potongan ke-2 belum ada');
  const play = res2();
  await streamSong({ params: { id }, headers: {} }, play);
  assert.equal(play.statusCode, 404, 'lagu belum selesai tidak bisa diputar');
});

test('lagu: playlist menerima path lagu upload, menolak path palsu; file tak terpakai dibersihkan', async () => {
  const out = sanitizePlaylist([{ title: 'A', url: '/api/public/song/0123456789abcdef', cat: 'old' }]);
  assert.equal(out[0].url, '/api/public/song/0123456789abcdef');
  assert.throws(() => sanitizePlaylist([{ title: 'x', url: '/api/public/song/../../admin' }]), /URL/);
  assert.throws(() => sanitizePlaylist([{ title: 'x', url: '/etc/passwd' }]), /URL/);

  const now = Date.now();
  state.db = new FakeDb({
    songMeta: {
      aaaa000000000001: { createdAt: now - 10 * S.ORPHAN_GRACE_MS, complete: true },
      bbbb000000000002: { createdAt: now - 10 * S.ORPHAN_GRACE_MS, complete: true },
      cccc000000000003: { createdAt: now - 1000, complete: true },
    },
  });
  const upd = await orphanCleanupUpdates(state.db, [{ url: '/api/public/song/aaaa000000000001' }], now);
  assert.deepEqual(Object.keys(upd).sort(), ['songData/bbbb000000000002', 'songMeta/bbbb000000000002']);
});

test('lagu: sniff format audio & parse Range', () => {
  const pad = (s) => Buffer.concat([Buffer.from(s, 'latin1'), Buffer.alloc(16)]);
  assert.equal(S.sniffAudioType(pad('OggS')).ext, 'ogg');
  assert.equal(S.sniffAudioType(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.alloc(8)])).ext, 'wav');
  assert.equal(S.sniffAudioType(Buffer.concat([Buffer.alloc(4), Buffer.from('ftypM4A '), Buffer.alloc(8)])).ext, 'm4a');
  assert.equal(S.sniffAudioType(Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x00]), Buffer.alloc(16)])).type, 'audio/mpeg');
  assert.equal(S.sniffAudioType(Buffer.concat([Buffer.from([0xff, 0xf1, 0x50, 0x80]), Buffer.alloc(16)])).type, 'audio/aac');
  assert.equal(S.sniffAudioType(Buffer.from('<html><body>bukan audio</body></html>')), null);
  assert.deepEqual(S.parseRange('bytes=0-1', 1000), { start: 0, end: 1, partial: true });
  assert.deepEqual(S.parseRange(undefined, 1000), { start: 0, end: 999, partial: false });
  assert.equal(S.parseRange('bytes=abc', 1000), null);
  assert.equal(S.parseRange('bytes=900-100', 1000), null);
});
