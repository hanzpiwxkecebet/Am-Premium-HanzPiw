/**
 * Uji coba pembacaan inbox generator.email dari komputer/VPS kamu sendiri.
 *
 *   node scripts/test-inbox.js                      -> buat alamat baru, tunggu email masuk
 *   node scripts/test-inbox.js nama@mail-temp.com   -> pantau alamat yang sudah ada
 *
 * Cara pakai: jalankan, lalu kirim email apa saja yang berisi sebuah link ke alamat yang tampil
 * (atau minta Alight Motion mengirim verifikasi ke alamat itu). Script menampilkan link yang terbaca.
 */
require('dotenv').config();
const { generateAddress, isAllowedAddress, checkInbox, DOMAINS } = require('../server/services/mailService');

(async () => {
  const address = process.argv[2] || generateAddress();
  if (!isAllowedAddress(address)) {
    console.error(`Alamat tidak diizinkan. Domain yang aktif: ${DOMAINS.join(', ')} (ubah lewat TEMPMAIL_DOMAINS)`);
    process.exit(1);
  }
  console.log('Alamat   :', address);
  console.log('Inbox web:', `https://generator.email/${address}`);
  console.log('Menunggu email masuk (maks 3 menit)...\n');

  const began = Date.now();
  while (Date.now() - began < 180000) {
    const r = await checkInbox(address);
    const t = Math.round((Date.now() - began) / 1000);
    if (r.status === 'found') { console.log(`[${t}s] DITEMUKAN:\n${r.link}`); return; }
    if (r.status === 'blocked') { console.error(`[${t}s] DIBLOKIR: ${r.message}. generator.email menolak IP ini.`); process.exit(2); }
    console.log(`[${t}s] ${r.status}${r.message ? ' - ' + r.message : ''}`);
    await new Promise(res => setTimeout(res, 5000));
  }
  console.log('Tidak ada link terbaca. Cek TEMPMAIL_LINK_HINT / TEMPMAIL_LINK_HOSTS atau buka inbox web untuk melihat isi emailnya.');
})();
