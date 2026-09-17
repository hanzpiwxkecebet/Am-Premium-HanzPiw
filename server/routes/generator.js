const express = require('express');
const router = express.Router();
const { sendEmail, verifyEmail, sendValidation, verifyValidation } = require('../controllers/generatorController');
const { sendLimiter, verifyLimiter } = require('../middleware/rateLimiter');
const { userAuthMiddleware } = require('../middleware/userAuth');

router.post('/send', sendLimiter, userAuthMiddleware, sendValidation, sendEmail);
router.post('/verify', verifyLimiter, userAuthMiddleware, verifyValidation, verifyEmail);

module.exports = router;
