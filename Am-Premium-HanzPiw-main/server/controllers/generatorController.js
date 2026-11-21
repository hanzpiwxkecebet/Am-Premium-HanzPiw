const { getDb } = require('../config/firebase');
const { sendVerification, verifyLink } = require('../services/apiService');
const { consumeLimit, refundLimit, recordUsage, updateStats } = require('../services/limitService');
const { v4: uuidv4 } = require('uuid');

/**
 * Step 1: Send verification email
 * Validates user, checks limit, calls API /send
 */
async function sendVerify(req, res) {
  const { email, method } = req.body;
  const { uid } = req.user;
  const requestId = req.headers['x-request-id'] || uuidv4();

  if (!email) return res.status(400).json({ success: false, message: 'Email wajib diisi' });

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ success: false, message: 'Format email tidak valid' });
  }

  // Check maintenance mode
  const db = getDb();
  const sysSnap = await db.ref('system/maintenance').once('value');
  if (sysSnap.val() === true) {
    return res.status(503).json({ success: false, message: 'Aplikasi sedang dalam maintenance' });
  }

  // If system email, check availability and lock it
  if (method === 'system') {
    const emailsSnap = await db.ref('emails').orderByChild('email').equalTo(email).once('value');
    let emailKey = null;
    let emailData = null;
    emailsSnap.forEach(child => { emailKey = child.key; emailData = child.val(); });

    if (!emailKey || !emailData) {
      return res.status(400).json({ success: false, message: 'Email sistem tidak ditemukan' });
    }
    if (!emailData.authorized) {
      return res.status(403).json({ success: false, message: 'Email sistem tidak diotorisasi' });
    }
    if (emailData.status === 'in_use') {
      return res.status(409).json({ success: false, message: 'Email sedang digunakan oleh pengguna lain' });
    }

    // Lock email
    await db.ref(`emails/${emailKey}`).update({ status: 'in_use', lockedBy: uid, lockedAt: Date.now() });
  }

  // Consume limit atomically
  const limitResult = await consumeLimit(uid);
  if (!limitResult.success) {
    return res.status(429).json({ success: false, message: limitResult.message, remaining: 0 });
  }

  // Create pending usage record
  const usageRef = db.ref(`usage/${uid}/${requestId}`);
  await usageRef.set({
    status: 'pending',
    method: method || 'custom',
    email_masked: maskEmail(email),
    requestId,
    createdAt: Date.now(),
    completedAt: null,
    duration: null,
  });

  // Call API
  let apiResult;
  try {
    apiResult = await sendVerification(email);
  } catch (err) {
    // Refund limit on API failure
    await refundLimit(uid);
    await usageRef.update({ status: 'failed_send', completedAt: Date.now() });
    if (method === 'system') {
      // Unlock email
      const emailsSnap = await db.ref('emails').orderByChild('email').equalTo(email).once('value');
      emailsSnap.forEach(async child => {
        await db.ref(`emails/${child.key}`).update({ status: 'available', lockedBy: null, lockedAt: null });
      });
    }
    return res.status(502).json({ success: false, message: `API gagal: ${err.message}` });
  }

  // Update status to waiting verification
  await usageRef.update({ status: 'waiting_verification', sentAt: Date.now() });

  return res.json({
    success: true,
    message: 'Verifikasi dikirim. Cek email kamu dan masukkan link verifikasi.',
    requestId,
    remaining: limitResult.remaining,
  });
}

/**
 * Step 2: Submit verification link and get result
 */
async function submitVerify(req, res) {
  const { email, link, requestId, method } = req.body;
  const { uid } = req.user;

  if (!email || !link || !requestId) {
    return res.status(400).json({ success: false, message: 'Email, link, dan requestId wajib diisi' });
  }

  const db = getDb();
  const usageRef = db.ref(`usage/${uid}/${requestId}`);
  const snap = await usageRef.once('value');

  if (!snap.exists()) {
    return res.status(404).json({ success: false, message: 'Request tidak ditemukan' });
  }

  const usageData = snap.val();
  if (!['waiting_verification', 'pending'].includes(usageData.status)) {
    return res.status(409).json({ success: false, message: `Proses tidak valid (status: ${usageData.status})` });
  }

  const startVerify = Date.now();
  await usageRef.update({ status: 'verifying', verifyStartedAt: startVerify });

  let apiResult;
  try {
    apiResult = await verifyLink(email, link);
  } catch (err) {
    const duration = Date.now() - startVerify;
    await usageRef.update({ status: 'failed', completedAt: Date.now(), duration, error: err.message });
    await updateStats(uid, false);

    // Unlock system email if used
    if (method === 'system') {
      await unlockSystemEmail(email, db);
    }

    return res.status(502).json({ success: false, message: `Verifikasi gagal: ${err.message}` });
  }

  const duration = Date.now() - startVerify;
  const isSuccess = apiResult.success;

  await usageRef.update({
    status: isSuccess ? 'completed' : 'failed',
    completedAt: Date.now(),
    duration,
    verifySuccess: isSuccess,
  });

  await updateStats(uid, isSuccess);

  // Unlock system email
  if (method === 'system') {
    await unlockSystemEmail(email, db);
  }

  // Update global stats
  if (isSuccess) {
    await db.ref('system/stats/totalSuccess').transaction(v => (v || 0) + 1);
  } else {
    await db.ref('system/stats/totalFailed').transaction(v => (v || 0) + 1);
  }

  return res.json({
    success: true,
    message: isSuccess ? 'Proses berhasil!' : 'Verifikasi tidak berhasil',
    result: isSuccess,
    data: { duration, requestId },
  });
}

async function unlockSystemEmail(email, db) {
  const emailsSnap = await db.ref('emails').orderByChild('email').equalTo(email).once('value');
  const updates = [];
  emailsSnap.forEach(child => {
    updates.push(db.ref(`emails/${child.key}`).update({ status: 'available', lockedBy: null, lockedAt: null }));
  });
  await Promise.all(updates);
}

function maskEmail(email) {
  const [local, domain] = email.split('@');
  const masked = local.substring(0, 2) + '***';
  return `${masked}@${domain}`;
}

module.exports = { sendVerify, submitVerify };
