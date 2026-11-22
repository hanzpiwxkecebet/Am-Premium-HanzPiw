/**
 * Migrasi sekali jalan: pindahkan foto profil lama (users/{uid}/photoURL & photoThumb)
 * ke userPhotos/{uid} dan userThumbs/{uid}. Opsional: profil juga dipindah otomatis saat user membukanya,
 * skrip ini hanya mempercepat untuk semua user sekaligus.
 *
 *   node scripts/migrate-photos.js          -> ringkasan saja (dry run)
 *   node scripts/migrate-photos.js --apply  -> jalankan
 * Butuh env Firebase yang sama dengan server (.env).
 */
require('dotenv').config();
const { getDb } = require('../server/config/firebase');

(async () => {
  const apply = process.argv.includes('--apply');
  const db = getDb();
  const snap = await db.ref('users').once('value');
  const updates = {};
  let n = 0;
  snap.forEach((c) => {
    const u = c.val();
    if (!u.photoURL && !u.photoThumb) return;
    n++;
    if (u.photoURL) updates[`userPhotos/${c.key}`] = u.photoURL;
    if (u.photoThumb) updates[`userThumbs/${c.key}`] = u.photoThumb;
    updates[`users/${c.key}/photoURL`] = null;
    updates[`users/${c.key}/photoThumb`] = null;
  });
  console.log(`${n} user punya foto di node lama.`);
  if (apply && n) { await db.ref('/').update(updates); console.log('Selesai dipindahkan.'); }
  else if (n) console.log('Dry run. Tambahkan --apply untuk menjalankan.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
