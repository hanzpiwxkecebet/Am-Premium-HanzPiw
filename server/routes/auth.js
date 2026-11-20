const express = require('express');
const router = express.Router();
const { authLimiter } = require('../middleware/rateLimiter');
const { verifyToken } = require('../middleware/auth');
const { registerUser, getUserByUsername, getProfile, updateProfile, getRole } = require('../controllers/authController');

router.post('/register', authLimiter, registerUser);
router.get('/username', authLimiter, getUserByUsername);
router.get('/profile', verifyToken, getProfile);
router.put('/profile', verifyToken, updateProfile);
router.get('/role', verifyToken, getRole);

module.exports = router;
