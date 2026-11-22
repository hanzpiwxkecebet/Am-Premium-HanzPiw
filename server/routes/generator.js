const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { generatorLimiter } = require('../middleware/rateLimiter');
const { deduplicateRequest } = require('../middleware/security');
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

router.post('/send', verifyToken, generatorLimiter, deduplicateRequest, checkMaintenance, sendVerify);
router.post('/verify', verifyToken, deduplicateRequest, checkMaintenance, submitVerify);

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
  const snap = await db.ref('emails').orderByChild('authorized').equalTo(true).once('value');
  const emails = [];
  snap.forEach(child => {
    const e = child.val();
    if (!e.authorized) return;
    if (e.status === 'in_use') emails.push({ id: child.key, email: e.email, status: 'in_use', inUse: true });
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
        total: Math.max(Number(s.totalProcess) || 0, finished),
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
