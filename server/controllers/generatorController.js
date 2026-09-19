const { body } = require('express-validator');
const { sendVerification, verifyPremium, parseApiResponse } = require('../services/apiService');
const { incrementStat, saveGeneration, checkCooldown } = require('../services/firebaseService');
const { validateRequest, getClientIp, sanitizeEmail } = require('../utils/helpers');

const sendValidation = [
  body('email').notEmpty().withMessage('Email tidak boleh kosong.').isEmail().withMessage('Format email tidak valid.').isLength({ max: 100 }).withMessage('Email terlalu panjang.').normalizeEmail()
];
const verifyValidation = [
  body('email').notEmpty().withMessage('Email tidak boleh kosong.').isEmail().withMessage('Format email tidak valid.'),
  body('link').notEmpty().withMessage('Link verifikasi tidak boleh kosong.').isLength({ min: 10, max: 2000 }).withMessage('Link tidak valid.')
];

async function sendEmail(req, res) {
  if (!validateRequest(req, res)) return;
  const ip = getClientIp(req);
  const uid = req.uid;
  const email = sanitizeEmail(req.body.email);

  try {
    // Check cooldown
    const remaining = await checkCooldown(ip);
    if (remaining > 0) return res.status(429).json({ success: false, error: `⏳ Tunggu ${remaining} detik sebelum mencoba lagi.`, code: 'COOLDOWN', remaining });

    const result = await sendVerification(email);
    if (!result.success) {
      await incrementStat('failed');
      await saveGeneration({ email, status: 'send_failed', ip });
      return res.status(400).json({ success: false, error: result.error || '❌ Gagal mengirim verifikasi. Coba lagi.', code: 'SEND_FAILED' });
    }

    const parsed = parseApiResponse(result.data);
    await incrementStat('total');
    return res.json({ success: true, message: parsed.message || '✅ Email verifikasi berhasil dikirim!', data: parsed.payload, requestId: Date.now().toString(36) });
  } catch (err) {
    console.error('[Controller] sendEmail error:', err.message);
    await incrementStat('failed');
    return res.status(500).json({ success: false, error: '❌ Terjadi kesalahan server. Coba lagi.', code: 'SERVER_ERROR' });
  }
}

async function verifyEmail(req, res) {
  if (!validateRequest(req, res)) return;
  const ip = getClientIp(req);
  const email = sanitizeEmail(req.body.email);
  const link = req.body.link?.trim();

  try {
    const result = await verifyPremium(email, link);
    if (!result.success) {
      await incrementStat('failed');
      await saveGeneration({ email, status: 'verify_failed', ip });
      return res.status(400).json({ success: false, error: result.error || '❌ Verifikasi gagal. Periksa link kamu.', code: 'VERIFY_FAILED' });
    }

    const parsed = parseApiResponse(result.data);
    if (!parsed.success) {
      await incrementStat('failed');
      await saveGeneration({ email, status: 'verify_api_failed', ip });
      return res.status(400).json({ success: false, error: parsed.message || '❌ Verifikasi gagal. Pastikan link valid.', code: 'VERIFY_FAILED', raw: parsed.raw });
    }

    await incrementStat('success');
    const genId = await saveGeneration({ email, status: 'success', ip });
    return res.json({ success: true, message: parsed.message || '🎉 Verifikasi berhasil! Alight Motion Premium aktif.', data: parsed.payload, link: parsed.link, generationId: genId, raw: parsed.raw });
  } catch (err) {
    console.error('[Controller] verifyEmail error:', err.message);
    await incrementStat('failed');
    return res.status(500).json({ success: false, error: '❌ Terjadi kesalahan server. Coba lagi.', code: 'SERVER_ERROR' });
  }
}

module.exports = { sendEmail, verifyEmail, sendValidation, verifyValidation };
