const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { redeemLimiter } = require('../middleware/rateLimiter');
const { dbRateLimit } = require('../middleware/dbRateLimit');
const { redeemCode, getRedeemHistory } = require('../controllers/redeemController');

const redeemPerUser = dbRateLimit({ name: 'redeem', windowMs: 10 * 60 * 1000, max: 10, key: (req) => req.user.uid, message: 'Terlalu banyak percobaan redeem. Coba lagi nanti.' });

router.post('/', verifyToken, redeemLimiter, redeemPerUser, redeemCode);
router.get('/history', verifyToken, getRedeemHistory);

module.exports = router;
