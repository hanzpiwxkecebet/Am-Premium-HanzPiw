const { verifyAdminToken } = require('../services/firebaseService');

async function adminAuthMiddleware(req, res, next) {
  try {
    const token = req.headers['authorization']?.replace('Bearer ', '') 
      || req.headers['x-admin-token']
      || req.query.token;

    if (!token) {
      return res.status(401).json({ success: false, error: 'Unauthorized: No token provided' });
    }

    const valid = await verifyAdminToken(token);
    if (!valid) {
      return res.status(403).json({ success: false, error: 'Forbidden: Invalid or expired token' });
    }

    req.isAdmin = true;
    next();
  } catch (e) {
    res.status(500).json({ success: false, error: 'Auth error' });
  }
}

module.exports = { adminAuthMiddleware };
