// Perawatan pool email sistem.
//
// Aturan:
//  - Email yang SUDAH DIGUNAKAN (status 'used') tetap berstatus "Telah Digunakan" selamanya untuk user,
//    lalu DIHAPUS dari pool setelah 7 hari sejak usedAt supaya daftar tidak menumpuk.
//  - Email 'in_use' (dikunci saat /send tapi tidak pernah diselesaikan) dilepas lagi setelah EMAIL_LOCK_TTL_MS
//    supaya tidak nyangkut. Riwayat user terkait ditandai 'expired'.

const USED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const LOCK_TTL_MS = (parseInt(process.env.EMAIL_LOCK_TTL_MIN, 10) || 30) * 60 * 1000;

function isUsedExpired(e, now = Date.now()) {
  return !!e && e.status === 'used' && Number(e.usedAt) > 0 && now - Number(e.usedAt) >= USED_RETENTION_MS;
}
function isLockStale(e, now = Date.now()) {
  return !!e && e.status === 'in_use' && Number(e.lockedAt) > 0 && now - Number(e.lockedAt) >= LOCK_TTL_MS;
}

/**
 * Hapus email 'used' > 7 hari dan lepaskan kunci 'in_use' yang basi. Aman dipanggil berulang / paralel.
 * @returns {{purged:number, released:number}}
 */
async function maintainEmails(db, now = Date.now()) {
  const result = { purged: 0, released: 0 };

  const usedSnap = await db.ref('emails').orderByChild('status').equalTo('used').once('value');
  const removals = [];
  usedSnap.forEach((child) => {
    if (isUsedExpired(child.val(), now)) removals.push(child.key);
  });
  for (const key of removals) {
    // transaksi: jangan hapus kalau datanya berubah di tengah jalan (mis. admin mengaktifkan ulang)
    let removed = false;
    await db.ref(`emails/${key}`).transaction((cur) => {
      if (!cur) return cur; // tebakan awal SDK: biarkan SDK mengulang dengan data asli
      if (!isUsedExpired(cur, now)) return; // sudah berubah: batalkan
      removed = true;
      return null;
    });
    if (removed) result.purged += 1;
  }

  const lockSnap = await db.ref('emails').orderByChild('status').equalTo('in_use').once('value');
  const stale = [];
  lockSnap.forEach((child) => {
    if (isLockStale(child.val(), now)) stale.push({ key: child.key, data: child.val() });
  });
  for (const { key, data } of stale) {
    let released = false;
    await db.ref(`emails/${key}`).transaction((cur) => {
      if (!cur) return cur;
      released = false;
      if (!isLockStale(cur, now)) return;
      released = true;
      cur.status = 'available';
      cur.lockedBy = null;
      cur.lockedAt = null;
      cur.lockedRequestId = null;
      return cur;
    });
    if (!released) continue;
    result.released += 1;
    // Tandai riwayat user yang tidak pernah diselesaikan (hanya kalau masih menunggu)
    if (data.lockedBy && data.lockedRequestId) {
      try {
        await db.ref(`usage/${data.lockedBy}/${data.lockedRequestId}`).transaction((cur) => {
          if (!cur) return cur;
          if (!['pending', 'waiting_verification'].includes(cur.status)) return;
          cur.status = 'expired';
          cur.completedAt = now;
          return cur;
        });
      } catch (e) { /* abaikan */ }
    }
  }
  return result;
}

// Dipanggil lewat jalur request (mis. daftar email) tapi dibatasi: maksimal sekali per 60 dtk per instance.
let lastRun = 0;
let running = null;
async function maintainEmailsThrottled(db, minGapMs = 60 * 1000) {
  if (running) return running;
  if (Date.now() - lastRun < minGapMs) return null;
  lastRun = Date.now();
  running = maintainEmails(db).catch((e) => { console.warn('[Email] maintenance gagal:', e.message); return null; })
    .finally(() => { running = null; });
  return running;
}

module.exports = { maintainEmails, maintainEmailsThrottled, isUsedExpired, isLockStale, USED_RETENTION_MS, LOCK_TTL_MS };
