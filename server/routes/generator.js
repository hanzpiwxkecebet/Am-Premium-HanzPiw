const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { generatorLimiter } = require('../middleware/rateLimiter');
const { dbRateLimit } = require('../middleware/dbRateLimit');
const { maintainEmailsThrottled, USED_RETENTION_MS } = require('../services/emailService');
const mail = require('../services/mailService');
const { sendVerify, submitVerify } = require('../controllers/generatorController');
const { getDb } = require('../config/firebase');
const { checkLimit } = require('../services/limitService');
const { checkApiStatus } = require('../services/apiService');

// Maintenance check middleware
let maintenanceCache = { v: false, t: 0 };
async function checkMaintenance(req, res, next) {
  if (Date.now() - maintenanceCache.t > 5000) {
    const snap = await getDb().ref('system/maintenance').once('value');
    maintenanceCache = { v: snap.val() === true, t: Date.now() };
  }
  if (maintenanceCache.v === true) {
    return res.status(503).json({ success: false, message: 'Aplikasi sedang dalam maintenance' });
  }
  next();
}

// Batas lintas instance (Firebase), per user: 5 generate / menit. generatorLimiter (memori) tetap jadi lapis pertama per IP.
const sendPerUser = dbRateLimit({ name: 'gen-send', windowMs: 60 * 1000, max: 5, key: (req) => req.user.uid, message: 'Terlalu cepat! Tunggu sebentar sebelum generate lagi.' });
const verifyPerUser = dbRateLimit({ name: 'gen-verify', windowMs: 60 * 1000, max: 10, key: (req) => req.user.uid, message: 'Terlalu banyak percobaan verifikasi. Tunggu sebentar.' });
const inboxPerUser = dbRateLimit({ name: 'gen-inbox', windowMs: 60 * 1000, max: 30, key: (req) => req.user.uid, message: 'Terlalu sering cek inbox. Tunggu sebentar.' });

router.post('/send', verifyToken, generatorLimiter, sendPerUser, checkMaintenance, sendVerify);
router.post('/verify', verifyToken, verifyPerUser, checkMaintenance, submitVerify);

// Email otomatis (generator.email): buat alamat baru & cek isi inbox. Klien memanggil /inbox berulang (polling).
router.post('/auto-email', verifyToken, checkMaintenance, async (req, res) => {
  return res.json({ success: true, data: { email: mail.generateAddress(), domains: mail.DOMAINS } });
});
router.get('/inbox', verifyToken, inboxPerUser, async (req, res) => {
  const address = String(req.query.address || '').toLowerCase().trim();
  if (!mail.isAllowedAddress(address)) {
    return res.status(400).json({ success: false, message: 'Alamat email tidak diizinkan' });
  }
  return res.json({ success: true, data: await mail.checkInbox(address) });
});

router.get('/limit', verifyToken, async (req, res) => {
  const result = await checkLimit(req.user.uid);
  return res.json({ success: true, data: result });
});

router.get('/history', verifyToken, async (req, res) => {
  const { uid } = req.user;
  const db = getDb();
  const snap = await db.ref(`usage/${uid}`).limitToLast(100).once('value');
  const history = [];
  snap.forEach(child => history.push({ id: child.key, ...child.val() }));
  history.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return res.json({ success: true, data: history });
});

// Semua email sistem yang aktif ditampilkan, lengkap dengan statusnya:
//   available -> bisa dipilih ("Tersedia")
//   in_use    -> sedang dipakai user lain ("Sedang dipakai")
// Email yang dinonaktifkan admin disembunyikan dari user.
router.get('/emails', verifyToken, async (req, res) => {
  const db = getDb();
  // Rawat pool (hapus 'used' > 7 hari, lepas kunci basi); dibatasi 1x/menit per instance
  await maintainEmailsThrottled(db);
  const snap = await db.ref('emails').orderByChild('authorized').equalTo(true).once('value');
  const emails = [];
  const now = Date.now();
  snap.forEach(child => {
    const e = child.val();
    if (!e.authorized) return;
    if (e.status === 'used' && e.usedAt && now - e.usedAt >= USED_RETENTION_MS) return; // menunggu dihapus
    if (e.status === 'in_use' || e.status === 'used') emails.push({ id: child.key, email: e.email, status: e.status, inUse: true });
    else if (!e.status || e.status === 'available') emails.push({ id: child.key, email: e.email, status: 'available', inUse: false });
  });
  // yang tersedia di atas, yang sedang dipakai di bawah
  emails.sort((a, b) => Number(a.inUse) - Number(b.inUse) || a.email.localeCompare(b.email));
  return res.json({ success: true, data: emails });
});

// Statistik GLOBAL (gabungan semua user) untuk kartu di dashboard
let globalStatsCache = { v: null, t: 0 };
router.get('/global-stats', verifyToken, async (req, res) => {
  if (!globalStatsCache.v || Date.now() - globalStatsCache.t > 10000) {
    const snap = await getDb().ref('system/stats').once('value');
    const s = snap.val() || {};
    const success = Number(s.totalSuccess) || 0;
    const failed = Number(s.totalFailed) || 0;
    const finished = success + failed;
    globalStatsCache = {
      t: Date.now(),
      v: {
        // Total = berhasil + gagal (proses selesai). totalProcess ikut menghitung proses yang masih menggantung
        // (mis. user menutup halaman sebelum verifikasi), jadi tidak dipakai di kartu ini.
        total: finished,
        success,
        failed,
        rate: finished > 0 ? Math.round((success / finished) * 100) : 0,
      },
    };
  }
  return res.json({ success: true, data: globalStatsCache.v });
});

// Tanpa verifyToken: tidak butuh database (verifyToken membaca users/{uid}). Kompatibel dengan klien lama.
router.get('/api-status', async (req, res) => {
  const status = await checkApiStatus();
  return res.json({ success: true, data: status });
});

module.exports = router;
