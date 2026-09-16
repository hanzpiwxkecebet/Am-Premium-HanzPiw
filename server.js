require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');

const { initializeFirebase } = require('./server/firebase/config');
const { maintenanceMiddleware } = require('./server/middleware/maintenance');
const { generalLimiter } = require('./server/middleware/rateLimiter');

const generatorRoutes = require('./server/routes/generator');
const statsRoutes = require('./server/routes/stats');
const adminRoutes = require('./server/routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;
const isDev = process.env.NODE_ENV !== 'production';

// Initialize Firebase
initializeFirebase();

// ─── Security Middleware ────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // Allow inline scripts for frontend
  crossOriginEmbedderPolicy: false
}));

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin) || isDev) cb(null, true);
    else cb(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

// ─── General Middleware ─────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
if (isDev) app.use(morgan('dev'));

// ─── Static Files ───────────────────────────────────────────────────────────
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets')));

// ─── Maintenance Check ──────────────────────────────────────────────────────
app.use(maintenanceMiddleware);

// ─── Rate Limiting ──────────────────────────────────────────────────────────
app.use('/api/', generalLimiter);

// ─── API Routes ─────────────────────────────────────────────────────────────
app.use('/api/generator', generatorRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/admin', adminRoutes);

// ─── Page Routes ────────────────────────────────────────────────────────────
const pages = {
  '/': 'index.html',
  '/generator': 'generator.html',
  '/tutorial': 'tutorial.html',
  '/faq': 'faq.html',
  '/about': 'about.html',
  '/contact': 'contact.html',
  '/history': 'history.html',
  '/admin': 'admin/login.html',
  '/admin/login': 'admin/login.html',
  '/admin/dashboard': 'admin/dashboard.html',
};

Object.entries(pages).forEach(([route, file]) => {
  app.get(route, (req, res) => {
    res.sendFile(path.join(__dirname, 'pages', file));
  });
});

// Handle .html extension
app.get('*.html', (req, res) => {
  const file = req.path.slice(1);
  const filePath = path.join(__dirname, 'pages', file);
  res.sendFile(filePath, (err) => {
    if (err) res.sendFile(path.join(__dirname, 'pages', '404.html'));
  });
});

// ─── Error Handler ──────────────────────────────────────────────────────────
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, error: 'Endpoint not found' });
  }
  res.sendFile(path.join(__dirname, 'pages', '404.html'));
});

app.use((err, req, res, next) => {
  console.error('[Server Error]', err.message);
  if (req.path.startsWith('/api/')) {
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
  res.status(500).send('Internal Server Error');
});

// ─── Start ──────────────────────────────────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n⚡ AM Premium Free by HanzPiw`);
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}\n`);
  });
}

module.exports = app;
