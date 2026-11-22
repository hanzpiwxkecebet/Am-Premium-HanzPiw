const rateLimit = require('express-rate-limit');

const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000; // 15 min

const generalLimiter = rateLimit({
  windowMs,
  // Operator seluler Indonesia memakai CGNAT: banyak user berbagi 1 IP, jadi batas dibuat longgar
  max: parseInt(process.env.RATE_LIMIT_MAX) || 400,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Terlalu banyak request. Coba lagi nanti.' },
  skipSuccessfulRequests: false,
  // Endpoint ringan/publik tidak ikut dihitung
  skip: (req) => req.path === '/health' || req.path === '/firebase-config' || req.path.startsWith('/public/'),
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // Operator seluler memakai CGNAT (banyak user 1 IP): 20 terlalu kecil dan memblokir user yang tidak bersalah
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 80,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.' },
});

const generatorLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.GENERATOR_RATE_LIMIT_MAX) || 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Terlalu cepat! Tunggu sebentar sebelum generate lagi.' },
});

// Dihitung per user (bukan per IP) karena banyak user seluler berbagi 1 IP. Wajib dipasang SETELAH verifyToken.
const tempMailLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: (req) => (req.user && req.user.uid) || 'anon',
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Terlalu cepat! Tunggu sebentar.' },
});

const inboxLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30, // polling tiap ~5 dtk = 12/menit
  keyGenerator: (req) => (req.user && req.user.uid) || 'anon',
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Terlalu sering cek inbox. Tunggu sebentar.' },
});

const redeemLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Terlalu banyak percobaan redeem. Coba lagi nanti.' },
});

module.exports = { generalLimiter, authLimiter, generatorLimiter, tempMailLimiter, inboxLimiter, redeemLimiter };
