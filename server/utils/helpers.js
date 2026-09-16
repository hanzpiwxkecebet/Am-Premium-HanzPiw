const { validationResult } = require('express-validator');

function validateRequest(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, error: errors.array()[0].msg, errors: errors.array() });
    return false;
  }
  return true;
}

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.connection?.remoteAddress
    || req.ip
    || 'unknown';
}

function sanitizeEmail(email) {
  return email?.toLowerCase().trim() || '';
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch { return false; }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function safeJsonParse(str) {
  try { return JSON.parse(str); } catch { return null; }
}

module.exports = { validateRequest, getClientIp, sanitizeEmail, isValidEmail, isValidUrl, sleep, safeJsonParse };
