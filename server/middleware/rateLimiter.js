const rateLimit = require('express-rate-limit');

const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW || '60000');
const max = parseInt(process.env.RATE_LIMIT_MAX || '10');

function createLimiter(options = {}) {
  return rateLimit({
    windowMs: options.windowMs || windowMs,
    max: options.max || max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: 'Too many requests. Please try again later.',
      code: 'RATE_LIMIT_EXCEEDED'
    },
    skip: (req) => {
      // Skip rate limit for admin routes with valid token
      const token = req.headers['x-admin-token'] || req.headers.authorization?.replace('Bearer ', '');
      return token === process.env.ADMIN_SECRET;
    }
  });
}

const sendLimiter = createLimiter({ max: 5, windowMs: 60000 });
const verifyLimiter = createLimiter({ max: 10, windowMs: 60000 });
const apiLimiter = createLimiter({ max: 30, windowMs: 60000 });
const generalLimiter = createLimiter({ max: 100, windowMs: 60000 });

module.exports = { sendLimiter, verifyLimiter, apiLimiter, generalLimiter, createLimiter };
