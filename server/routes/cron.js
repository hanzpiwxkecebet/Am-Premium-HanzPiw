// Perawatan terjadwal (Vercel Cron, lihat vercel.json). Dilindungi CRON_SECRET:
// Vercel otomatis mengirim "Authorization: Bearer <CRON_SECRET>" bila env CRON_SECRET diisi.
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { getDb } = require('../config/firebase');
const { maintainEmails } = require('../services/emailService');
const { purgeRateLimits } = require('../middleware/dbRateLimit');

function safeEqual(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

router.get('/cleanup', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ success: false, message: 'CRON_SECRET belum diisi' });
  if (!safeEqual(req.headers.authorization || '', `Bearer ${secret}`)) {
    return res.status(401).json({ success: false, message: 'Tidak diizinkan' });
  }
  const db = getDb();
  const emails = await maintainEmails(db);        // hapus email 'used' > 7 hari, lepas kunci basi
  const rateLimits = await purgeRateLimits(db);   // bersihkan bucket rate limit yang sudah lewat
  return res.json({ success: true, data: { emails, rateLimits } });
});

module.exports = router;
