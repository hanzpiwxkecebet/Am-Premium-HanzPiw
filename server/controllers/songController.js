const crypto = require('crypto');
const { getDb } = require('../config/firebase');
const { logAction } = require('../services/auditService');
const S = require('../services/songService');

// ─── Upload (owner) ──────────────────────────────────────────────────────────
// Alur dari browser: start -> chunk (berulang) -> finish. Lagu baru benar-benar dipakai
// setelah owner menekan "Simpan Semua Pengaturan" (url lagu masuk ke playlist).

async function startUpload(req, res) {
  const size = Number(req.body && req.body.size);
  const name = String((req.body && req.body.name) || '').substring(0, 120);
  if (!Number.isInteger(size) || size < 1024) {
    return res.status(400).json({ success: false, message: 'File audio tidak valid' });
  }
  if (size > S.MAX_SONG_BYTES) {
    return res.status(400).json({ success: false, message: `File terlalu besar (maks ${Math.round(S.MAX_SONG_BYTES / 1024 / 1024)}MB per lagu)` });
  }
  const id = crypto.randomBytes(8).toString('hex');
  await getDb().ref(`songMeta/${id}`).set({
    name, size, chunkSize: S.CHUNK_SIZE, chunks: S.chunkCount(size), complete: false, createdAt: Date.now(),
  });
  return res.json({ success: true, data: { id, chunkSize: S.CHUNK_SIZE, chunks: S.chunkCount(size) } });
}

async function uploadChunk(req, res) {
  const { id, data } = req.body || {};
  const index = Number(req.body && req.body.index);
  if (!S.ID_RE.test(String(id || ''))) return res.status(400).json({ success: false, message: 'ID upload tidak valid' });
  const db = getDb();
  const snap = await db.ref(`songMeta/${id}`).once('value');
  const meta = snap.val();
  if (!meta || meta.complete) return res.status(404).json({ success: false, message: 'Sesi upload tidak ditemukan atau sudah selesai' });
  if (!Number.isInteger(index) || index < 0 || index >= meta.chunks) {
    return res.status(400).json({ success: false, message: 'Nomor potongan tidak valid' });
  }
  if (typeof data !== 'string' || data.length > S.CHUNK_SIZE * 1.4 || !S.B64_RE.test(data)) {
    return res.status(400).json({ success: false, message: 'Data potongan tidak valid' });
  }
  const buf = Buffer.from(data, 'base64');
  if (buf.length !== S.expectedChunkBytes(meta.size, index)) {
    return res.status(400).json({ success: false, message: 'Ukuran potongan tidak sesuai' });
  }
  await db.ref('/').update({
    [`songData/${id}/${index}`]: data,
    [`songMeta/${id}/parts/${index}`]: buf.length,
  });
  return res.json({ success: true });
}

async function finishUpload(req, res) {
  const id = String((req.body && req.body.id) || '');
  if (!S.ID_RE.test(id)) return res.status(400).json({ success: false, message: 'ID upload tidak valid' });
  const db = getDb();
  const meta = (await db.ref(`songMeta/${id}`).once('value')).val();
  if (!meta || meta.complete) return res.status(404).json({ success: false, message: 'Sesi upload tidak ditemukan atau sudah selesai' });

  const parts = meta.parts || {};
  let total = 0;
  for (let i = 0; i < meta.chunks; i++) {
    if (!parts[i]) return res.status(400).json({ success: false, message: `Potongan ${i + 1} belum terkirim, ulangi upload` });
    total += parts[i];
  }
  if (total !== meta.size) return res.status(400).json({ success: false, message: 'Ukuran file tidak cocok, ulangi upload' });

  const first = (await db.ref(`songData/${id}/0`).once('value')).val();
  const kind = S.sniffAudioType(Buffer.from(String(first || ''), 'base64').subarray(0, 64));
  if (!kind) {
    await removeSong(db, id);
    return res.status(400).json({ success: false, message: 'Isi file bukan audio yang didukung (MP3, M4A/AAC, OGG, WAV, FLAC, WebM)' });
  }
  await db.ref('/').update({
    [`songMeta/${id}/complete`]: true,
    [`songMeta/${id}/type`]: kind.type,
    [`songMeta/${id}/parts`]: null,
  });
  await logAction({ actorUID: req.user.uid, actorRole: req.user.role, action: 'upload_song', summary: `Upload lagu "${meta.name}" (${Math.round(meta.size / 1024)} KB)` });
  return res.json({ success: true, data: { id, url: S.songPath(id), title: S.titleFromFilename(meta.name), type: kind.type } });
}

async function removeSong(db, id) {
  await db.ref('/').update({ [`songMeta/${id}`]: null, [`songData/${id}`]: null });
}

/**
 * Hapus file lagu yang tidak lagi dipakai playlist (dan sisa upload gagal).
 * Upload baru diberi masa tenggang supaya tidak terhapus sebelum owner sempat menyimpan playlist.
 * Mengembalikan peta update (nilai null) untuk digabung ke update multi-path pemanggil.
 */
async function orphanCleanupUpdates(db, playlist, now = Date.now()) {
  const keep = new Set((playlist || []).map((s) => S.songIdFromUrl(s.url)).filter(Boolean));
  const metas = (await db.ref('songMeta').once('value')).val() || {};
  const updates = {};
  for (const [id, m] of Object.entries(metas)) {
    if (keep.has(id)) continue;
    if (now - ((m && m.createdAt) || 0) < S.ORPHAN_GRACE_MS) continue;
    updates[`songMeta/${id}`] = null;
    updates[`songData/${id}`] = null;
  }
  return updates;
}

// ─── Penyajian (publik) ──────────────────────────────────────────────────────

async function streamSong(req, res) {
  const id = String(req.params.id || '');
  if (!S.ID_RE.test(id)) return res.status(404).json({ success: false, message: 'Lagu tidak ditemukan' });
  const db = getDb();
  const meta = (await db.ref(`songMeta/${id}`).once('value')).val();
  if (!meta || meta.complete !== true || !meta.type) return res.status(404).json({ success: false, message: 'Lagu tidak ditemukan' });

  const range = S.parseRange(req.headers.range, meta.size);
  if (!range) {
    res.set({ 'Content-Range': `bytes */${meta.size}` });
    return res.status(416).end();
  }
  const { start, end, partial } = range;
  const cs = meta.chunkSize || S.CHUNK_SIZE;
  const firstIdx = Math.floor(start / cs);
  const lastIdx = Math.floor(end / cs);
  const pieces = await Promise.all(
    Array.from({ length: lastIdx - firstIdx + 1 }, (_, k) => db.ref(`songData/${id}/${firstIdx + k}`).once('value'))
  );
  const missing = pieces.some((p) => !p.exists());
  if (missing) return res.status(404).json({ success: false, message: 'Data lagu tidak lengkap' });
  const all = Buffer.concat(pieces.map((p) => Buffer.from(p.val(), 'base64')));
  const body = all.subarray(start - firstIdx * cs, start - firstIdx * cs + (end - start + 1));

  const headers = {
    'Content-Type': meta.type,
    'Content-Length': String(body.length),
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
    // ID lagu unik & isinya tidak pernah berubah -> aman di-cache lama
    'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable',
  };
  if (partial) {
    headers['Content-Range'] = `bytes ${start}-${end}/${meta.size}`;
    res.status(206);
  }
  res.set(headers);
  return res.send(body);
}

module.exports = { startUpload, uploadChunk, finishUpload, orphanCleanupUpdates, streamSong };
