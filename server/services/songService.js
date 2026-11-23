// Lagu yang diupload owner (file audio langsung, tanpa link).
// Penyimpanan di Realtime Database, dipecah per potongan supaya tiap request kecil
// (batas body Vercel 4,5MB) dan tiap potongan jauh di bawah batas ukuran node:
//   songMeta/{id} = { name, size, chunkSize, chunks, parts:{i:bytes}, type, complete, createdAt }
//   songData/{id}/{i} = potongan ke-i (base64)
// Lagu disajikan lewat GET /api/public/song/:id (mendukung HTTP Range supaya bisa di-seek).

const CHUNK_SIZE = 512 * 1024;            // 512KB mentah per potongan (~683KB base64)
const MAX_SONG_BYTES = 12 * 1024 * 1024;  // 12MB per lagu
const MAX_RESPONSE_BYTES = 3 * 1024 * 1024; // sisakan ruang di bawah batas respons Vercel (4,5MB)
const ORPHAN_GRACE_MS = 60 * 60 * 1000;   // upload yang belum masuk playlist dihapus setelah 1 jam
const ID_RE = /^[a-f0-9]{16}$/;
const SONG_PATH_RE = /^\/api\/public\/song\/([a-f0-9]{16})$/;
const B64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

function songPath(id) { return `/api/public/song/${id}`; }
function songIdFromUrl(url) {
  const m = SONG_PATH_RE.exec(String(url || ''));
  return m ? m[1] : null;
}

function chunkCount(size) { return Math.ceil(size / CHUNK_SIZE); }
function expectedChunkBytes(size, index) {
  const n = chunkCount(size);
  return index < n - 1 ? CHUNK_SIZE : size - CHUNK_SIZE * (n - 1);
}

/** Kenali format audio dari byte awal. Return { type, ext } atau null kalau bukan audio yang didukung. */
function sniffAudioType(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf.toString('latin1', 0, 3) === 'ID3') return { type: 'audio/mpeg', ext: 'mp3' };
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) {
    const layer = (buf[1] >> 1) & 3; // 0 = AAC (ADTS), 1..3 = MPEG layer III..I
    if (layer === 0) return { type: 'audio/aac', ext: 'aac' };
    return { type: 'audio/mpeg', ext: 'mp3' };
  }
  if (buf.toString('latin1', 0, 4) === 'OggS') return { type: 'audio/ogg', ext: 'ogg' };
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WAVE') return { type: 'audio/wav', ext: 'wav' };
  if (buf.toString('latin1', 4, 8) === 'ftyp') return { type: 'audio/mp4', ext: 'm4a' };
  if (buf.toString('latin1', 0, 4) === 'fLaC') return { type: 'audio/flac', ext: 'flac' };
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return { type: 'audio/webm', ext: 'webm' };
  return null;
}

/**
 * Baca header Range. Return:
 *   { start, end, partial } kalau valid (end sudah dibatasi MAX_RESPONSE_BYTES),
 *   null kalau Range tidak memenuhi syarat (balas 416).
 * Tanpa header Range: seluruh file, tapi dipotong ke MAX_RESPONSE_BYTES (partial = true bila terpotong).
 */
function parseRange(header, size) {
  let start = 0;
  let end = size - 1;
  let ranged = false;
  if (header) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
    if (!m || (m[1] === '' && m[2] === '')) return null;
    ranged = true;
    if (m[1] === '') {                       // bytes=-N  (N byte terakhir)
      const n = parseInt(m[2], 10);
      if (!n) return null;
      start = Math.max(0, size - n);
    } else {
      start = parseInt(m[1], 10);
      if (m[2] !== '') end = Math.min(end, parseInt(m[2], 10));
    }
    if (start >= size || start > end) return null;
  }
  if (end - start + 1 > MAX_RESPONSE_BYTES) end = start + MAX_RESPONSE_BYTES - 1;
  return { start, end, partial: ranged || end < size - 1 };
}

/** Nama file -> judul lagu (tanpa ekstensi, maks 60 karakter). */
function titleFromFilename(name) {
  return String(name || '').replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 60);
}

module.exports = {
  CHUNK_SIZE, MAX_SONG_BYTES, MAX_RESPONSE_BYTES, ORPHAN_GRACE_MS, ID_RE, B64_RE,
  songPath, songIdFromUrl, chunkCount, expectedChunkBytes, sniffAudioType, parseRange, titleFromFilename,
};
