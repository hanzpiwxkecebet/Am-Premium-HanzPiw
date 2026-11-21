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
  max: 20,
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

const redeemLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Terlalu banyak percobaan redeem. Coba lagi nanti.' },
});

module.exports = { generalLimiter, authLimiter, generatorLimiter, redeemLimiter };
