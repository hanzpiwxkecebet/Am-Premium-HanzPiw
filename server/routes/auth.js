const express = require('express');
const router = express.Router();
const { verifyToken, verifyTokenOnly } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const {
  registerUser,
  getUserByUsername,
  getProfile,
  updateProfile,
  updateUsername,
  recordLoginMethod,
  getRole,
} = require('../controllers/authController');

// Register profil (dipanggil setelah akun Firebase dibuat di client).
// Pakai verifyTokenOnly karena profil belum ada di database.
router.post('/register', authLimiter, verifyTokenOnly, registerUser);

// Cari email dari username (untuk login via username)
router.get('/username', authLimiter, getUserByUsername);

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
