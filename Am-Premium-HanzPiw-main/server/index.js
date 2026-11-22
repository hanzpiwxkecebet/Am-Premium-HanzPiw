require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// Tangkap error dari handler async (Express 4 tidak melakukannya otomatis)
const Layer = require('express/lib/router/layer');
const _handleRequest = Layer.prototype.handle_request;
Layer.prototype.handle_request = function (req, res, next) {
  const fn = this.handle;
  if (fn.length > 3) return next();
  try {
    const result = fn(req, res, next);
    if (result && typeof result.catch === 'function') result.catch(next);
  } catch (err) {
    next(err);
  }
};

const { initFirebase, resetConnection } = require('./config/firebase');
const { generalLimiter } = require('./middleware/rateLimiter');
const { sanitizeBody, secureHeaders } = require('./middleware/security');

// Initialize Firebase Admin.
// Jangan sampai crash saat load: kalau env belum benar, function tetap hidup dan
// endpoint yang butuh database akan membalas JSON error (bukan halaman 500 HTML).
try {
  initFirebase();
} catch (err) {
  console.error('[Firebase] Init gagal:', err.message);
}

const app = express();

// Di Vercel / reverse proxy lain: wajib agar req.ip = IP asli pengunjung.
// Tanpa ini SEMUA user berbagi satu kuota rate-limit (IP proxy) dan cepat kena "Terlalu banyak request".
app.set('trust proxy', 1);

// Security headers
app.use(secureHeaders());

// CORS - in production, restrict to your domain
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? [process.env.APP_URL, `https://${process.env.VERCEL_URL}`].filter(Boolean)
    : '*',
  credentials: true,
}));

// Body parsing
// Dua endpoint butuh body lebih besar dari 10kb. Parser khusus harus dipasang SEBELUM parser global.
//  - PUT /api/auth/profile : foto profil (data URL hasil resize di browser, maks ~150kb)
//  - POST /api/admin/emails : tambah email bulk (maks 200 email)
app.use('/api/auth/profile', express.json({ limit: '300kb' }));
app.use('/api/admin/emails', express.json({ limit: '40kb' }));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Sanitize all inputs
app.use(sanitizeBody);

// Batas waktu per request API: kalau database menggantung, balas JSON jelas
// (bukan menunggu sampai Vercel memutus dengan halaman 504 kosong).
// Pengecualian:
//  - /api/health punya timeout sendiri per tahap diagnosa
//  - /api/generator/send & /verify memanggil API pihak ketiga yang memang bisa makan puluhan detik
const LONG_ROUTES = ['/api/generator/send', '/api/generator/verify'];
app.use('/api/', (req, res, next) => {
  const path = req.originalUrl.split('?')[0].replace(/\/+$/, '');
  if (path === '/api/health') return next();

  const isLong = LONG_ROUTES.includes(path);
  const timer = setTimeout(() => {
    if (res.headersSent) return;
    console.error('[Timeout]', req.method, req.originalUrl);
    if (isLong) {
      res.status(504).json({ success: false, message: 'API pihak ketiga terlalu lama merespons. Coba lagi.' });
      return;
    }
    // Koneksi database kemungkinan mati: buat ulang supaya request berikutnya tidak ikut menggantung
    resetConnection();
    res.status(504).json({
      success: false,
      message: 'Database tidak merespons. Buka /api/health?deep=1 untuk diagnosa.',
    });
  }, isLong ? 55000 : 8000);
  res.on('finish', () => clearTimeout(timer));
  res.on('close', () => clearTimeout(timer));
  next();
});

// Apply general rate limit
app.use('/api/', generalLimiter);

// URL bersih: /dashboard (bukan /pages/dashboard.html). Di Vercel ini ditangani vercel.json;
// blok ini untuk menjalankan lokal / hosting lain (mis. Pterodactyl).
const CLEAN_PAGES = ['login', 'register', 'dashboard', 'generator', 'history', 'redeem', 'updates', 'profile', 'admin', 'owner', 'maintenance'];
app.get(/^\/pages\/([a-z]+?)(?:\.html)?$/, (req, res, next) => {
  const name = req.params[0];
  if (!CLEAN_PAGES.includes(name)) return next();
  const qIndex = req.originalUrl.indexOf('?');
  res.redirect(301, '/' + name + (qIndex >= 0 ? req.originalUrl.slice(qIndex) : ''));
});
CLEAN_PAGES.forEach((name) => {
  app.get('/' + name, (req, res) => res.sendFile(path.join(__dirname, '../public/pages/' + name + '.html')));
});

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/generator', require('./routes/generator'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/redeem', require('./routes/redeem'));
app.use('/api/public', require('./routes/public'));

// Health check. ?deep=1 = diagnosa koneksi database (hanya menampilkan true/false & waktu, TIDAK pernah nilai secret)
app.get('/api/health', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const base = { status: 'ok', version: process.env.APP_VERSION || '2.0.0-beta', ts: Date.now() };

  // ?warm=1 dipanggil otomatis oleh browser (boot.js): bangunkan function SEKALIGUS buka koneksi database
  // selagi SDK Firebase & script lain masih diunduh, supaya request pertama user tidak kena cold start penuh.
  if (req.query.warm === '1') {
    try {
      const { getDb, withTimeout } = require('./config/firebase');
      await withTimeout(getDb().ref('system/maintenance').once('value'), 4000, 'warm timeout');
      base.db = true;
    } catch (e) {
      base.db = false;
    }
    return res.json(base);
  }

  if (req.query.deep !== '1') return res.json(base);

  const env = {};
  ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY', 'FIREBASE_DATABASE_URL',
   'FIREBASE_API_KEY', 'OWNER_UID', 'APP_URL'].forEach((k) => { env[k] = !!process.env[k]; });

  const report = { ...base, env, region: process.env.VERCEL_REGION || null };
  try {
    const { diagnose } = require('./config/firebase');
    const d = await diagnose();
    report.database = d;
    const ok = d.credential.ok !== false && d.rest.ok !== false && d.websocket.ok !== false;
    if (!ok) report.status = 'error';
    report.hint = diagnoseHint(d);
  } catch (err) {
    report.status = 'error';
    report.database = { error: String(err && err.message ? err.message : err).slice(0, 300) };
  }
  res.status(report.status === 'ok' ? 200 : 503).json(report);
});

// Terjemahkan hasil diagnosa jadi saran langsung
function diagnoseHint(d) {
  if (d.credential.ok === false) {
    return 'Credential Firebase ditolak: FIREBASE_PRIVATE_KEY / FIREBASE_CLIENT_EMAIL salah, kunci sudah dihapus/diganti, atau jam server bermasalah. Buat service account key BARU di Firebase Console > Project settings > Service accounts, lalu isi ulang kedua env itu persis dari file JSON dan Redeploy.';
  }
  if (d.credential.emailMatchesProject === false) {
    return 'FIREBASE_CLIENT_EMAIL bukan dari project yang sama dengan FIREBASE_PROJECT_ID.';
  }
  if (d.rest.ok === false && d.rest.status === 404) {
    return 'Alamat database tidak ditemukan. Cek FIREBASE_DATABASE_URL (salin persis dari Firebase Console > Realtime Database, termasuk region mis. .asia-southeast1.firebasedatabase.app).';
  }
  if (d.rest.ok === false && (d.rest.status === 401 || d.rest.status === 403)) {
    return 'Token ditolak oleh database: service account bukan dari project database ini.';
  }
  if (d.rest.ok === false) {
    return 'Server Vercel tidak bisa menjangkau database lewat HTTPS: ' + (d.rest.error || 'tidak ada detail');
  }
  if (d.websocket.ok === false) {
    return 'REST berhasil tapi WebSocket gagal. Biasanya koneksi basi setelah function idle; coba lagi, atau pindahkan Function Region Vercel dekat region database.';
  }
  return 'Semua normal.';
}

// Firebase config for client (public keys only - never private keys)
app.get('/api/firebase-config', (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400');
  const config = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    databaseURL: process.env.FIREBASE_DATABASE_URL,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
  };
  // Only return if all keys exist
  if (!config.apiKey || !config.projectId) {
    return res.status(503).json({ success: false, message: 'Firebase belum dikonfigurasi' });
  }
  res.json({ success: true, data: config });
});

// Catch-all: serve SPA for unmatched routes (non-API)
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, message: 'Endpoint tidak ditemukan' });
  }
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  // Body JSON rusak / terlalu besar -> 400/413, bukan 500
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Format JSON tidak valid' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'Data terlalu besar' });
  }

  console.error('[Error]', err && err.stack ? err.stack : err);
  res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
});

// Di Vercel app diexport sebagai serverless function; listen hanya untuk lokal
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`[Server] AM Premium Generator v2.0 running on port ${PORT}`);
  });
}

module.exports = app;
