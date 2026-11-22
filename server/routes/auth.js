const express = require('express');
const router = express.Router();
const { verifyToken, verifyTokenOnly } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const { dbRateLimit } = require('../middleware/dbRateLimit');

const ipOf = (req) => req.ip || (req.headers['x-forwarded-for'] || '').split(',')[0] || 'unknown';
// Batas lintas instance: per IP+username (tebak password satu akun) dan per IP (menyisir banyak username)
const loginPerAccount = dbRateLimit({ name: 'login-acct', windowMs: 15 * 60 * 1000, max: 10, key: (req) => `${ipOf(req)}|${String((req.body && req.body.username) || '').toLowerCase()}`, message: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.' });
const loginPerIp = dbRateLimit({ name: 'login-ip', windowMs: 15 * 60 * 1000, max: 60, key: ipOf, message: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.' });
const {
  registerUser,
  checkUsernameAvailable,
  loginWithUsername,
  getProfile,
  updateProfile,
  updateUsername,
  recordLoginMethod,
  getRole,
} = require('../controllers/authController');

// Register profil (dipanggil setelah akun Firebase dibuat di client).
// Pakai verifyTokenOnly karena profil belum ada di database.
router.post('/register', authLimiter, verifyTokenOnly, registerUser);

// Cek ketersediaan username (form daftar). Tidak mengembalikan data akun.
router.get('/username-available', authLimiter, checkUsernameAvailable);

// Login via username: email tidak pernah keluar dari server; klien menerima custom token.
router.post('/login-username', authLimiter, loginPerIp, loginPerAccount, loginWithUsername);

// Ambil profil. Kalau belum ada (mis. user Google baru), otomatis dibuat.
router.get('/profile', verifyTokenOnly, getProfile);

// Update profil
router.put('/profile', verifyToken, updateProfile);

// Ganti username (cooldown 7 hari)
router.put('/username', authLimiter, verifyToken, updateUsername);

// Catat metode login terakhir (google/email/username). Boleh dipanggil sebelum profil ada.
router.post('/login-method', verifyTokenOnly, recordLoginMethod);

// Cek role
router.get('/role', verifyToken, getRole);

module.exports = router;
