const { getDb } = require('../config/firebase');
const { sendVerification, verifyLink } = require('../services/apiService');
const { consumeLimit, refundLimit, recordUsage, updateStats, bumpGlobalStat } = require('../services/limitService');
const { v4: uuidv4 } = require('uuid');

// requestId dipakai sebagai key di Firebase: tidak boleh mengandung . # $ [ ] /
const SEND_INFLIGHT_MS = 60 * 1000;
const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

function sanitizeRequestId(raw) {
  const id = String(raw || '');
  return REQUEST_ID_RE.test(id) ? id : uuidv4();
}

/**
 * Step 1: Send verification email
 * Validates user, checks limit, calls API /send
 */
async function sendVerify(req, res) {
  const { email, method } = req.body;
  const { uid } = req.user;
  const requestId = sanitizeRequestId(req.headers['x-request-id']);

  if (!email) return res.status(400).json({ success: false, message: 'Email wajib diisi' });

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ success: false, message: 'Format email tidak valid' });
  }

  // (maintenance sudah diperiksa middleware checkMaintenance di route)
  const db = getDb();

  // Satu proses /send per user pada satu waktu: cegah double-tap / request ganda yang memakai limit dua kali
  const inflight = await db.ref(`pendingRequests/${uid}`).transaction((cur) => {
    if (cur && cur.t && Date.now() - cur.t < SEND_INFLIGHT_MS) return; // masih berjalan: batalkan
    return { t: Date.now(), requestId };
  });
  if (!inflight.committed) {
    return res.status(429).json({ success: false, message: 'Permintaan sebelumnya masih diproses. Tunggu sebentar.' });
  }
  try {
    return await doSend({ req, res, db, uid, email, method, requestId });
  } finally {
    db.ref(`pendingRequests/${uid}`).remove().catch(() => {});
  }
}

async function doSend({ req, res, db, uid, email, method, requestId }) {
  // If system email, check availability and lock it
  let emailLocked = false;
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
    if (emailData.status === 'in_use' || emailData.status === 'used') {
      return res.status(409).json({ success: false, message: 'Email ini telah digunakan, pilih email lain' });
    }
    if (emailData.status && emailData.status !== 'available') {
      return res.status(403).json({ success: false, message: 'Email sistem sedang dinonaktifkan' });
    }

    // Lock email secara atomik (cegah dua user mengunci email yang sama bersamaan)
    const lockResult = await db.ref(`emails/${emailKey}`).transaction(cur => {
      if (!cur) return cur;
      if (cur.status === 'in_use' || cur.status === 'used' || cur.authorized !== true) return; // abort
      cur.status = 'in_use';
      cur.lockedBy = uid;
      cur.lockedAt = Date.now();
      cur.lockedRequestId = requestId;
      return cur;
    });
    if (!lockResult.committed) {
      return res.status(409).json({ success: false, message: 'Email ini telah digunakan, pilih email lain' });
    }
    emailLocked = true;
  }

  const usageRef = db.ref(`usage/${uid}/${requestId}`);
  let limitConsumed = false;

  try {
    // Consume limit atomically
    const limitResult = await consumeLimit(uid);
    if (!limitResult.success) {
      // Limit habis: lepas kunci email supaya tidak nyangkut "in_use" selamanya
      if (emailLocked) await unlockSystemEmail(email, db);
      return res.status(429).json({ success: false, message: limitResult.message, remaining: 0 });
    }
    limitConsumed = true;
    await bumpGlobalStat('totalProcess', 1);

    // Create pending usage record
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
      await bumpGlobalStat('totalProcess', -1);
      await usageRef.update({ status: 'failed_send', completedAt: Date.now() });
      if (emailLocked) await unlockSystemEmail(email, db);
      return res.status(502).json({ success: false, message: `API gagal: ${err.message}` });
    }

    // Update status to waiting verification
    await usageRef.update({ status: 'waiting_verification', sentAt: Date.now() });

    return res.json({
      success: true,
      message: 'Verifikasi dikirim. Cek email kamu dan masukkan link verifikasi.',
      requestId,
      remaining: limitResult.remaining,
      unlimited: !!limitResult.unlimited,
    });
  } catch (err) {
    // Error tak terduga (mis. database): kembalikan limit & kunci email, lalu biarkan error handler membalas
    if (limitConsumed) { try { await refundLimit(uid); await bumpGlobalStat('totalProcess', -1); } catch (e) { /* abaikan */ } }
    if (emailLocked) { try { await unlockSystemEmail(email, db); } catch (e) { /* abaikan */ } }
    throw err;
  }
}

/**
 * Step 2: Submit verification link and get result
 */
async function submitVerify(req, res) {
  const { email, link, requestId, method: reqMethod } = req.body;
  const { uid } = req.user;

  if (!email || !link || !requestId) {
    return res.status(400).json({ success: false, message: 'Email, link, dan requestId wajib diisi' });
  }
  if (!REQUEST_ID_RE.test(String(requestId))) {
    return res.status(400).json({ success: false, message: 'requestId tidak valid' });
  }

  const db = getDb();
  const usageRef = db.ref(`usage/${uid}/${requestId}`);
  const startVerify = Date.now();

  // Klaim atomik: hanya SATU request yang boleh mengubah waiting_verification -> verifying.
  // (Sebelumnya cek lalu update: tap ganda bisa memanggil API pihak ketiga dua kali.)
  let prev = null;
  const claim = await usageRef.transaction((cur) => {
    prev = cur;
    if (!cur) return cur; // tebakan awal SDK (cache kosong): kembalikan apa adanya, SDK mengulang dengan data asli
    if (!['waiting_verification', 'pending'].includes(cur.status)) return;
    cur.status = 'verifying';
    cur.verifyStartedAt = startVerify;
    return cur;
  });
  const claimed = claim.snapshot && claim.snapshot.val();
  if (!claimed) return res.status(404).json({ success: false, message: 'Request tidak ditemukan' });
  if (!claim.committed) {
    return res.status(409).json({ success: false, message: `Proses tidak valid (status: ${claimed.status})` });
  }
  const usageData = claimed;

  // Email harus sama dengan yang dikirimi verifikasi, dan metode dibaca dari catatan server (bukan dari klien)
  if (usageData.email_masked && usageData.email_masked.toLowerCase() !== maskEmail(email).toLowerCase()) {
    await usageRef.update({ status: 'waiting_verification' }); // kembalikan agar bisa dicoba lagi dengan email yang benar
    return res.status(400).json({ success: false, message: 'Email tidak cocok dengan permintaan sebelumnya' });
  }
  const method = usageData.method || reqMethod;

  let apiResult;
  try {
    apiResult = await verifyLink(email, link);
  } catch (err) {
    const duration = Date.now() - startVerify;
    await usageRef.update({ status: 'failed', completedAt: Date.now(), duration, error: err.message });
    await updateStats(uid, false);
    await bumpGlobalStat('totalFailed', 1);

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

  // Email sistem: sukses -> ditandai "Telah Digunakan" (tidak dipakai lagi); gagal -> dibuka kembali
  if (method === 'system') {
    if (isSuccess) await markSystemEmailUsed(email, db, uid);
    else await unlockSystemEmail(email, db);
  }

  // Update global stats
  await bumpGlobalStat(isSuccess ? 'totalSuccess' : 'totalFailed', 1);

  return res.json({
    success: true,
    message: isSuccess ? 'Proses berhasil!' : 'Verifikasi tidak berhasil',
    result: isSuccess,
    data: { duration, requestId },
  });
}

async function markSystemEmailUsed(email, db, uid) {
  const emailsSnap = await db.ref('emails').orderByChild('email').equalTo(email).once('value');
  const updates = [];
  emailsSnap.forEach(child => {
    updates.push(db.ref(`emails/${child.key}`).update({ status: 'used', usedBy: uid, usedAt: Date.now(), lockedBy: null, lockedAt: null, lockedRequestId: null }));
  });
  await Promise.all(updates);
}

async function unlockSystemEmail(email, db) {
  const emailsSnap = await db.ref('emails').orderByChild('email').equalTo(email).once('value');
  const updates = [];
  emailsSnap.forEach(child => {
    updates.push(db.ref(`emails/${child.key}`).update({ status: 'available', lockedBy: null, lockedAt: null, lockedRequestId: null }));
  });
  await Promise.all(updates);
}

function maskEmail(email) {
  const [local, domain] = email.split('@');
  const masked = local.substring(0, 2) + '***';
  return `${masked}@${domain}`;
}

module.exports = { sendVerify, submitVerify };
