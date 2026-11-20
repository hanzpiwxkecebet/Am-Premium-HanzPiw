const { getDb } = require('../config/firebase');

/**
 * Redeem a code (atomic transaction)
 */
async function redeemCode(req, res) {
  const { code } = req.body;
  const { uid } = req.user;

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ success: false, message: 'Kode redeem wajib diisi' });
  }

  const codeClean = code.trim().toUpperCase();
  const db = getDb();

  // Check if user already used this code
  const usedRef = db.ref(`users/${uid}/redeemedCodes/${codeClean}`);
  const usedSnap = await usedRef.once('value');
  if (usedSnap.exists()) {
    return res.status(409).json({ success: false, message: 'Kamu sudah menggunakan kode ini' });
  }

  const codeRef = db.ref(`redeem/${codeClean}`);
  let result = { success: false, message: 'Kode tidak ditemukan' };

  await codeRef.transaction(codeData => {
    if (!codeData) {
      result = { success: false, message: 'Kode tidak ditemukan' };
      return codeData;
    }

    if (!codeData.active) {
      result = { success: false, message: 'Kode sudah tidak aktif' };
      return codeData; // No change
    }

    if (codeData.expiresAt && Date.now() > codeData.expiresAt) {
      result = { success: false, message: 'Kode sudah kedaluwarsa' };
      return codeData;
    }

    if (codeData.maxUses && codeData.usedCount >= codeData.maxUses) {
      result = { success: false, message: 'Kode sudah mencapai batas penggunaan' };
      return codeData;
    }

    codeData.usedCount = (codeData.usedCount || 0) + 1;
    if (codeData.maxUses && codeData.usedCount >= codeData.maxUses) {
      codeData.active = false;
    }

    result = { success: true, type: codeData.type, value: codeData.value };
    return codeData;
  });

  if (!result.success) {
    return res.status(400).json(result);
  }

  // Apply reward
  const userRef = db.ref(`users/${uid}`);
  const updates = {};
  updates[`users/${uid}/redeemedCodes/${codeClean}`] = { redeemedAt: Date.now() };

  if (result.type === 'limit') {
    // Atomically add limit
    await userRef.transaction(userData => {
      if (!userData) return userData;
      userData.dailyLimit = (userData.dailyLimit || 20) + Number(result.value);
      return userData;
    });
  } else if (result.type === 'premium') {
    const duration = Number(result.value) * 24 * 60 * 60 * 1000; // days to ms
    updates[`users/${uid}/role`] = 'premium';
    updates[`users/${uid}/premiumExpiresAt`] = Date.now() + duration;
  } else if (result.type === 'special') {
    updates[`users/${uid}/specialAccess`] = result.value;
  }

  await db.ref('/').update(updates);

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
