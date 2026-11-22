// Foto profil disimpan TERPISAH dari users/{uid}:
//   userPhotos/{uid}  = foto 256px (data URL, hingga ~150KB)
//   userThumbs/{uid}  = thumbnail 64px (hingga ~15KB, dipakai di daftar admin)
// Alasannya: node users/{uid} dibaca di setiap request terautentikasi dan dikirim penuh pada setiap transaksi
// (limit, statistik, redeem). Dengan foto di dalamnya, tiap operasi membawa ratusan KB.
// Data lama (foto masih di users/{uid}) dipindah otomatis saat profil dibuka.

async function getPhoto(db, uid) {
  const snap = await db.ref(`userPhotos/${uid}`).once('value');
  return snap.exists() ? String(snap.val() || '') : '';
}

async function setPhoto(db, uid, photoURL, photoThumb) {
  const updates = {};
  updates[`userPhotos/${uid}`] = photoURL || null;
  updates[`userThumbs/${uid}`] = photoThumb || null;
  // pastikan sisa data lama di node users ikut bersih
  updates[`users/${uid}/photoURL`] = null;
  updates[`users/${uid}/photoThumb`] = null;
  await db.ref('/').update(updates);
}

/** Pindahkan foto lama dari users/{uid} ke node terpisah. Mengembalikan { photoURL, photoThumb } yang berlaku. */
async function migrateLegacyPhoto(db, uid, userData) {
  const legacyMain = userData && typeof userData.photoURL === 'string' ? userData.photoURL : '';
  const legacyThumb = userData && typeof userData.photoThumb === 'string' ? userData.photoThumb : '';
  if (!legacyMain && !legacyThumb) return null;
  const updates = {};
  if (legacyMain) updates[`userPhotos/${uid}`] = legacyMain;
  if (legacyThumb) updates[`userThumbs/${uid}`] = legacyThumb;
  updates[`users/${uid}/photoURL`] = null;
  updates[`users/${uid}/photoThumb`] = null;
  await db.ref('/').update(updates);
  return { photoURL: legacyMain, photoThumb: legacyThumb };
}

/** Semua thumbnail sekaligus (untuk daftar user admin): { uid: dataUrl } */
async function getAllThumbs(db) {
  const snap = await db.ref('userThumbs').once('value');
  return snap.val() || {};
}

module.exports = { getPhoto, setPhoto, migrateLegacyPhoto, getAllThumbs };
