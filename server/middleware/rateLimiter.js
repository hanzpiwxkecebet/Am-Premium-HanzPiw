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
  skip: (req) => req.path === '/health' || req.path === '/firebase-config' || req.path.startsWith('/public/') ||
    req.path.startsWith('/chat/media/') || req.path.startsWith('/chat/sticker/') || req.path === '/chat/state' || req.path === '/chat/members' || req.path.startsWith('/chat/mentions') || req.path === '/chat/avatars',
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

const redeemLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Terlalu banyak percobaan redeem. Coba lagi nanti.' },
});

const chatReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 45,
  keyGenerator: (req) => (req.user && req.user.uid) || 'anon',
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Terlalu sering memuat chat.' },
});

module.exports = { chatReadLimiter, generalLimiter, authLimiter, generatorLimiter, redeemLimiter };
