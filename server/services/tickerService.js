// Running text di Dashboard: maks 5 bar, tiap bar punya label sendiri (mis. "PENGUMUMAN" / "Welcome") dan teksnya sendiri.
const MAX_ITEMS = 5;
const MAX_LABEL = 14;
const MAX_TEXT = 240;
const DEFAULT_LABEL = 'PENGUMUMAN';

function clean(s, max) {
  // buang karakter kontrol & rapikan spasi; teks ditampilkan klien dengan textContent (bukan HTML)
  return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().substring(0, max);
}

// Menerima bentuk baru [{label, text}] dan bentuk lama (['teks', ...] + label bersama)
function sanitizeTicker(input) {
  const t = input && typeof input === 'object' ? input : {};
  const raw = Array.isArray(t.items) ? t.items : (t.items && typeof t.items === 'object' ? Object.values(t.items) : []);
  const sharedLabel = clean(t.label, MAX_LABEL);
  const items = [];
  let extra = 0;
  raw.forEach((x) => {
    const isObj = x && typeof x === 'object';
    const text = clean(isObj ? x.text : x, MAX_TEXT);
    if (!text) return;
    if (items.length >= MAX_ITEMS) { extra++; return; }
    items.push({ label: clean(isObj ? x.label : '', MAX_LABEL) || sharedLabel || DEFAULT_LABEL, text });
  });
  if (extra) { const err = new Error(`Maksimal ${MAX_ITEMS} running text`); err.status = 400; throw err; }
  return { enabled: t.enabled !== false && t.enabled !== 'false', items };
}

// Dari database -> bentuk aman untuk klien (data rusak tidak boleh merusak dashboard)
function readTicker(raw) {
  try { return sanitizeTicker(raw); } catch (e) { return { enabled: false, items: [] }; }
}

module.exports = { sanitizeTicker, readTicker, MAX_ITEMS, MAX_LABEL, MAX_TEXT, DEFAULT_LABEL };
