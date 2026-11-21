require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// Tangkap error dari handler async (Express 4 tidak melakukannya otomatis)
const Layer = require('express/lib/router/layer');
const _handleRequest = Layer.prototype.handle_request;
Layer.prototype.handle_request = function (req, res, next) {
  const fn = this.handle;
  if (fn.length > 3) return next();
  try {
    const result = fn(req, res, next);
    if (result && typeof result.catch === 'function') result.catch(next);
  } catch (err) {
    next(err);
  }
};

const { initFirebase } = require('./config/firebase');
const { generalLimiter } = require('./middleware/rateLimiter');
const { sanitizeBody, secureHeaders } = require('./middleware/security');

// Initialize Firebase Admin
initFirebase();

const app = express();

// Security headers
app.use(secureHeaders());

// CORS - in production, restrict to your domain
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? [process.env.APP_URL, `https://${process.env.VERCEL_URL}`].filter(Boolean)
    : '*',
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Sanitize all inputs
app.use(sanitizeBody);

// Apply general rate limit
app.use('/api/', generalLimiter);

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/generator', require('./routes/generator'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/redeem', require('./routes/redeem'));
app.use('/api/public', require('./routes/public'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: process.env.APP_VERSION || '2.0.0-beta', ts: Date.now() });
});

// Firebase config for client (public keys only - never private keys)
app.get('/api/firebase-config', (req, res) => {
  const config = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    databaseURL: process.env.FIREBASE_DATABASE_URL,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
  };
  // Only return if all keys exist
  if (!config.apiKey || !config.projectId) {
    return res.status(503).json({ success: false, message: 'Firebase belum dikonfigurasi' });
  }
  res.json({ success: true, data: config });
});

// Catch-all: serve SPA for unmatched routes (non-API)
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, message: 'Endpoint tidak ditemukan' });
  }
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Error]', err.stack);
  res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
});

// Di Vercel app diexport sebagai serverless function; listen hanya untuk lokal
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`[Server] AM Premium Generator v2.0 running on port ${PORT}`);
  });
}

module.exports = app;
