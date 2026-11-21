const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { redeemLimiter } = require('../middleware/rateLimiter');
const { redeemCode, getRedeemHistory } = require('../controllers/redeemController');

router.post('/', verifyToken, redeemLimiter, redeemCode);
router.get('/history', verifyToken, getRedeemHistory);

module.exports = router;
