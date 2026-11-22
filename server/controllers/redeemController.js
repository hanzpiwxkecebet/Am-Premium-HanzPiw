const { getDb } = require('../config/firebase');
const { invalidateUser } = require('../middleware/auth');
const { getDefaultLimit } = require('../services/limitService');
const { extendPremium } = require('../services/premiumService');

/**
 * Redeem a code (atomic transaction)
 */
async function redeemCode(req, res) {
  const { code } = req.body;
  const { uid, role } = req.user;

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ success: false, message: 'Kode redeem wajib diisi' });
  }

  const codeClean = code.trim().toUpperCase();
  // Kode dipakai sebagai key database: hanya huruf & angka
  if (!/^[A-Z0-9]{4,32}$/.test(codeClean)) {
    return res.status(400).json({ success: false, message: 'Format kode tidak valid' });
  }
  const db = getDb();

  // 1) Klaim atomik "kode ini sudah dipakai user ini" SEBELUM apa pun (cegah dobel-redeem dari request paralel)
  const claimRef = db.ref(`users/${uid}/redeemedCodes/${codeClean}`);
  const claim = await claimRef.transaction((cur) => (cur ? undefined : { redeemedAt: Date.now() }));
  if (!claim.committed) {
    return res.status(409).json({ success: false, message: 'Kamu sudah menggunakan kode ini' });
  }
  const releaseClaim = () => claimRef.remove().catch(() => {});

  // 2) Pakai kode (atomik pada node kode)
  const codeRef = db.ref(`redeem/${codeClean}`);
  let result = { success: false, message: 'Kode tidak ditemukan' };
  let consumedUse = false;
  try {
    await codeRef.transaction(codeData => {
      consumedUse = false;
      if (!codeData) {
        result = { success: false, message: 'Kode tidak ditemukan' };
        return codeData;
      }
      if (!codeData.active) {
        result = { success: false, message: 'Kode sudah tidak aktif' };
        return; // batalkan (tidak ada perubahan)
      }
      if (codeData.expiresAt && Date.now() > codeData.expiresAt) {
        result = { success: false, message: 'Kode sudah kedaluwarsa' };
        return;
      }
      if (codeData.maxUses && (codeData.usedCount || 0) >= codeData.maxUses) {
        result = { success: false, message: 'Kode sudah mencapai batas penggunaan' };
        return;
      }
      codeData.usedCount = (codeData.usedCount || 0) + 1;
      if (codeData.maxUses && codeData.usedCount >= codeData.maxUses) {
        codeData.active = false;
      }
      consumedUse = true;
      result = { success: true, type: codeData.type, value: codeData.value };
      return codeData;
    });
  } catch (err) {
    await releaseClaim();
    throw err;
  }

  if (!result.success || !consumedUse) {
    await releaseClaim();
    return res.status(400).json(result.success ? { success: false, message: 'Kode tidak ditemukan' } : result);
  }

  // 3) Beri hadiah. Kalau gagal: kembalikan pemakaian kode & klaim supaya user tidak rugi.
  try {
    const userRef = db.ref(`users/${uid}`);
    const updates = {};

    if (result.type === 'limit') {
      const addLimit = Number(result.value);
      if (Number.isFinite(addLimit) && addLimit > 0) {
        const fallback = await getDefaultLimit();
        await userRef.transaction(userData => {
          if (!userData) return userData;
          userData.dailyLimit = (userData.dailyLimit ?? fallback) + addLimit;
          return userData;
        });
      }
    } else if (result.type === 'premium') {
      const days = Number(result.value);
      if (Number.isFinite(days) && days > 0) {
        const curExp = (await db.ref(`users/${uid}/premiumExpiresAt`).once('value')).val();
        const curRole = (await db.ref(`users/${uid}/role`).once('value')).val() || role;
        // Jangan turunkan role staff (admin/owner/moderator) menjadi premium
        if (curRole === 'user' || curRole === 'premium') updates[`users/${uid}/role`] = 'premium';
        // Perpanjang dari sisa masa aktif kalau masih premium
        updates[`users/${uid}/premiumExpiresAt`] = extendPremium(curRole === 'premium' ? curExp : 0, days);
      }
    } else if (result.type === 'special') {
      updates[`users/${uid}/specialAccess`] = result.value;
    }

    if (Object.keys(updates).length) await db.ref('/').update(updates);
  } catch (err) {
    await releaseClaim();
    await codeRef.transaction((c) => {
      if (!c) return c;
      c.usedCount = Math.max(0, (c.usedCount || 0) - 1);
      if (c.maxUses && c.usedCount < c.maxUses) c.active = true;
      return c;
    }).catch(() => {});
    throw err;
  }
  invalidateUser(uid);

  // Add to redeem history
  const historyId = `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  await db.ref(`users/${uid}/redeemHistory/${historyId}`).set({
    code: codeClean,
    type: result.type,
    value: result.value,
    redeemedAt: Date.now(),
  });

  return res.json({
    success: true,
    message: `Kode berhasil diredeem! (${result.type})`,
    data: { type: result.type, value: result.value },
  });
}

/**
 * Get redeem history for current user
 */
async function getRedeemHistory(req, res) {
  const { uid } = req.user;
  const db = getDb();
  const snap = await db.ref(`users/${uid}/redeemHistory`).once('value');
  const history = [];
  snap.forEach(child => history.push({ id: child.key, ...child.val() }));
  history.sort((a, b) => (b.redeemedAt || 0) - (a.redeemedAt || 0));
  return res.json({ success: true, data: history });
}

module.exports = { redeemCode, getRedeemHistory };
