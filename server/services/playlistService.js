// Playlist backsound: daftar lagu { title, url, cat } yang diatur owner.
// "ALL" tidak disimpan — itu pilihan bawaan di klien yang berisi semua lagu.
const MAX_SONGS = 60;
const MAX_CAT_LEN = 20;
const MAX_TITLE_LEN = 60;
const MAX_URL_LEN = 500;
// Link luar (http/https) ATAU file yang diupload owner (/api/public/song/<id>)
const URL_RE = /^(https?:\/\/[^\s]+|\/api\/public\/song\/[a-f0-9]{16})$/i;

function cleanCat(c) {
  const v = String(c == null ? '' : c).trim().toUpperCase().replace(/\s+/g, ' ').substring(0, MAX_CAT_LEN);
  return v === 'ALL' ? '' : v; // kosong = hanya muncul di ALL
}

// Dipakai saat owner menyimpan. Melempar Error (pesan siap tampil) kalau ada data tidak valid.
function sanitizePlaylist(input) {
  if (!Array.isArray(input)) throw new Error('Playlist harus berupa daftar lagu');
  if (input.length > MAX_SONGS) throw new Error(`Maksimal ${MAX_SONGS} lagu di playlist`);
  const seen = new Set();
  const out = [];
  input.forEach((s, i) => {
    const url = String((s && s.url) || '').trim();
    if (!url) return; // baris kosong diabaikan
    if (url.length > MAX_URL_LEN || !URL_RE.test(url)) {
      throw new Error(`Lagu #${i + 1}: URL harus diawali http:// atau https:// dan tanpa spasi (atau pakai tombol Upload Lagu)`);
    }
    if (seen.has(url)) return; // duplikat dibuang
    seen.add(url);
    out.push({
      title: String((s && s.title) || '').trim().substring(0, MAX_TITLE_LEN) || `Lagu ${out.length + 1}`,
      url,
      cat: cleanCat(s && s.cat),
    });
  });
  return out;
}

// Dipakai saat membaca dari database (data lama / rusak tidak boleh merusak klien).
function readPlaylist(raw) {
  const arr = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' ? Object.values(raw) : []);
  try { return sanitizePlaylist(arr.slice(0, MAX_SONGS)); } catch (e) { return []; }
}

module.exports = { sanitizePlaylist, readPlaylist, cleanCat, MAX_SONGS };
