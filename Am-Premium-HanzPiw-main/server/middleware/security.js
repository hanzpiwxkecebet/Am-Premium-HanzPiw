const helmet = require('helmet');
const xss = require('xss');

function sanitizeInput(value) {
  if (typeof value === 'string') {
    return xss(value.trim());
  }
  if (typeof value === 'object' && value !== null) {
    const sanitized = {};
    for (const key of Object.keys(value)) {
      sanitized[key] = sanitizeInput(value[key]);
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
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'https://*.firebaseio.com', 'wss://*.firebaseio.com', 'https://*.firebasedatabase.app', 'wss://*.firebasedatabase.app', 'https://*.googleapis.com', 'https://identitytoolkit.googleapis.com', 'https://securetoken.googleapis.com'],
        frameSrc: ["'self'", 'https://*.firebaseapp.com', 'https://accounts.google.com'],
      },
    },
    crossOriginEmbedderPolicy: false,
  });
}

// Duplicate request protection via requestId tracking (in-memory, per server instance)
// For production with multiple instances, use Redis
const processedRequests = new Map();
const REQUEST_TTL = 10 * 60 * 1000; // 10 minutes

function deduplicateRequest(req, res, next) {
  const requestId = req.headers['x-request-id'];
  if (!requestId) return next();

  if (processedRequests.has(requestId)) {
    return res.status(409).json({ success: false, message: 'Request duplikat terdeteksi', requestId });
  }

  processedRequests.set(requestId, Date.now());

  // Cleanup old entries
  if (processedRequests.size > 10000) {
    const now = Date.now();
    for (const [id, ts] of processedRequests.entries()) {
      if (now - ts > REQUEST_TTL) processedRequests.delete(id);
    }
  }

  next();
}

module.exports = { sanitizeBody, secureHeaders, deduplicateRequest };
