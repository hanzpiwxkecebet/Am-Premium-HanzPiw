const express = require('express');
const router = express.Router();
const { sendEmail, verifyEmail, sendValidation, verifyValidation } = require('../controllers/generatorController');
const { sendLimiter, verifyLimiter } = require('../middleware/rateLimiter');

router.post('/send', sendLimiter, sendValidation, sendEmail);
router.post('/verify', verifyLimiter, verifyValidation, verifyEmail);

module.exports = router;
