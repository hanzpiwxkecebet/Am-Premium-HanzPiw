const helmet = require('helmet');
const xss = require('xss');

function sanitizeInput(value) {
  if (typeof value === 'string') {
    return xss(value.trim());
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeInput);
  }
  if (typeof value === 'object' && value !== null) {
    const sanitized = {};
    for (const key of Object.keys(value)) {
      // Password apa adanya: trim/escape akan mengubah password yang berisi < > & atau spasi di ujung
      sanitized[key] = key === 'password' ? value[key] : sanitizeInput(value[key]);
    }
    return sanitized;
  }
  return value;
}

function sanitizeBody(req, res, next) {
  if (req.body) {
    req.body = sanitizeInput(req.body);
  }
  next();
}

function secureHeaders() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://www.gstatic.com', 'https://apis.google.com'],
        // Halaman memakai onclick="..." inline; tanpa ini diblokir helmet saat dijalankan lewat Express
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        // Backsound: URL audio bisa diganti owner ke domain mana pun (https)
        mediaSrc: ["'self'", 'https:', 'blob:', 'data:'],
        connectSrc: ["'self'", 'https://*.firebaseio.com', 'wss://*.firebaseio.com', 'https://*.firebasedatabase.app', 'wss://*.firebasedatabase.app', 'https://*.googleapis.com', 'https://identitytoolkit.googleapis.com', 'https://securetoken.googleapis.com', 'https://*.firebaseapp.com'],
        frameSrc: ["'self'", 'https://*.firebaseapp.com', 'https://accounts.google.com'],
      },
    },
    crossOriginEmbedderPolicy: false,
    // Default helmet (same-origin) memutus komunikasi popup Google Sign-In
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  });
}

module.exports = { sanitizeBody, secureHeaders };
