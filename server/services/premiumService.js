// Masa aktif premium. Redeem tipe "premium" mengisi users/{uid}/premiumExpiresAt (ms epoch).
// Role 'premium' otomatis turun ke 'user' begitu masa itu lewat. Role staff tidak pernah disentuh.

/** true kalau user berstatus premium dan masa aktifnya sudah habis. Tanpa premiumExpiresAt = permanen (diberi admin). */
function isPremiumExpired(user, now = Date.now()) {
  if (!user || user.role !== 'premium') return false;
  const exp = Number(user.premiumExpiresAt);
  return Number.isFinite(exp) && exp > 0 && exp <= now;
}

/**
 * Turunkan role ke 'user' kalau premium sudah habis. Mengembalikan data (baru) agar bisa dipakai langsung.
 * Atomik: kalau di antara waktu itu admin sudah mengubah role / memperpanjang, tidak ditimpa.
 */
async function expirePremiumIfNeeded(db, uid, user, now = Date.now()) {
  if (!isPremiumExpired(user, now)) return user;
  try {
    await db.ref(`users/${uid}`).transaction((cur) => {
      if (!cur) return cur;
      if (!isPremiumExpired(cur, now)) return; // sudah berubah: batalkan
      cur.role = 'user';
      cur.premiumExpiresAt = null;
      return cur;
    });
  } catch (e) {
    console.warn('[Premium] gagal menurunkan role:', e.message);
  }
  return { ...user, role: 'user', premiumExpiresAt: null };
}

/** Hitung masa aktif baru: perpanjang dari sisa masa kalau masih aktif, kalau tidak mulai dari sekarang. */
function extendPremium(currentExpiresAt, days, now = Date.now()) {
  const base = Number(currentExpiresAt) > now ? Number(currentExpiresAt) : now;
  return base + days * 24 * 60 * 60 * 1000;
}

module.exports = { isPremiumExpired, expirePremiumIfNeeded, extendPremium };
