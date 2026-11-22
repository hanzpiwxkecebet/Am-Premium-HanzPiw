const express = require('express');
const router = express.Router();
const { getDb } = require('../config/firebase');
const { checkApiStatus } = require('../services/apiService');

const DEFAULT_BACKSOUND_URL = 'https://u.pone.rs/lgqzjhof.mp3';

// Info background untuk klien. Gambar upload disajikan lewat /api/public/background?v=<versi>
// (data gambar disimpan terpisah dari 'system' supaya /status tetap kecil).
function backgroundInfo(sys) {
  const version = sys.bgVersion || 0;
  const isUpload = sys.bgSource === 'upload';
  const url = isUpload ? (sys.bgHasUpload === true ? `/api/public/background?v=${version}` : '') : (sys.bgUrl || '');
  const blur = Number.isFinite(Number(sys.bgBlur)) ? Math.min(24, Math.max(0, Number(sys.bgBlur))) : 6;
  return { enabled: sys.bgEnabled === true && !!url, url, blur, version };
}

router.get('/background', async (req, res) => {
  const db = getDb();
  const snap = await db.ref('backgroundAsset').once('value');
  const asset = snap.val();
  if (!asset || typeof asset.data !== 'string') {
    return res.status(404).json({ success: false, message: 'Background tidak ada' });
  }
  const type = asset.type === 'png' || asset.type === 'webp' ? asset.type : 'jpeg';
  const buf = Buffer.from(asset.data.slice(asset.data.indexOf(',') + 1), 'base64');
  res.set({
    'Content-Type': `image/${type}`,
    'X-Content-Type-Options': 'nosniff',
    // URL selalu membawa ?v=<versi>, jadi aman di-cache lama; ganti gambar = URL baru
    'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable',
  });
  return res.send(buf);
});

// Public announcements (active only) — di-cache di edge Vercel supaya tidak kena cold start
router.get('/announcements', async (req, res) => {
  res.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=300');
  const db = getDb();
  const snap = await db.ref('announcements').orderByChild('active').equalTo(true).once('value');
  const items = [];
  snap.forEach(child => {
    const v = child.val();
    if (v.active) items.push({ id: child.key, title: v.title, content: v.content, priority: v.priority, createdAt: v.createdAt });
  });
  items.sort((a, b) => (b.priority || 0) - (a.priority || 0) || (b.createdAt || 0) - (a.createdAt || 0));
  return res.json({ success: true, data: items });
});

// Status API pihak ketiga. TIDAK memakai database/token: status layanan harus tetap
// bisa diperiksa walau database sedang bermasalah. Hasil di-cache 30 dtk (apiService) & di edge Vercel.
router.get('/api-status', async (req, res) => {
  res.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
  const status = await checkApiStatus();
  return res.json({ success: true, data: status });
});

// System status (maintenance, version)
router.get('/status', async (req, res) => {
  res.set('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=60');
  const db = getDb();
  const snap = await db.ref('system').once('value');
  const sys = snap.val() || {};
  return res.json({
    success: true,
    data: {
      maintenance: sys.maintenance === true,
      maintenanceMessage: sys.maintenanceMessage || '',
      appVersion: sys.appVersion || process.env.APP_VERSION || '2.0.0-beta',
      apiStatus: sys.apiStatus || 'unknown',
      // Backsound: default aktif; owner bisa mengganti URL & default aktif/nonaktif
      backsound: {
        enabled: sys.backsoundEnabled !== false,
        url: sys.backsoundUrl || DEFAULT_BACKSOUND_URL,
      },
      // Background kustom (default nonaktif = tampilan bawaan)
      background: backgroundInfo(sys),
    }
  });
});

module.exports = router;
