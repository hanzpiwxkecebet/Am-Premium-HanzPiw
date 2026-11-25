// Running text di Dashboard: label (mis. "PENGUMUMAN" / "Welcome") + maks 5 teks yang berjalan bergantian.
const MAX_ITEMS = 5;
const MAX_LABEL = 14;
const MAX_TEXT = 240;
const DEFAULT_LABEL = 'PENGUMUMAN';

function clean(s, max) {
  // buang karakter kontrol & rapikan spasi; teks ditampilkan klien dengan textContent (bukan HTML)
  return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().substring(0, max);
}

function sanitizeTicker(input) {
  const t = input && typeof input === 'object' ? input : {};
  const arr = Array.isArray(t.items) ? t.items : (t.items && typeof t.items === 'object' ? Object.values(t.items) : []);
  const items = arr.map((x) => clean(x, MAX_TEXT)).filter(Boolean).slice(0, MAX_ITEMS);
  if (Array.isArray(t.items) && t.items.length > MAX_ITEMS && t.items.slice(MAX_ITEMS).some((x) => clean(x, 1))) {
    const err = new Error(`Maksimal ${MAX_ITEMS} running text`); err.status = 400; throw err;
  }
  return { enabled: t.enabled !== false && t.enabled !== 'false', label: clean(t.label, MAX_LABEL) || DEFAULT_LABEL, items };
}

// Dari database -> bentuk aman untuk klien (data rusak tidak boleh merusak dashboard)
function readTicker(raw) {
  try { return sanitizeTicker(raw); } catch (e) { return { enabled: false, label: DEFAULT_LABEL, items: [] }; }
}

module.exports = { sanitizeTicker, readTicker, MAX_ITEMS, MAX_LABEL, MAX_TEXT, DEFAULT_LABEL };
