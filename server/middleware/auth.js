async function adminAuthMiddleware(req, res, next) {
  try {
    const token = req.headers['authorization']?.replace('Bearer ', '')
      || req.headers['x-admin-token']
      || req.query.token;

    if (!token) return res.status(401).json({ success: false, error: 'Unauthorized' });

    // Primary: check ADMIN_SECRET
    if (token === process.env.ADMIN_SECRET) {
      req.isAdmin = true;
      return next();
    }

    // Fallback: Firebase Auth token
    try {
      const { getAdmin } = require('../firebase/config');
      const admin = getAdmin();
      if (admin && admin.apps.length) {
        await admin.auth().verifyIdToken(token);
        req.isAdmin = true;
        return next();
      }
    } catch {}

    return res.status(403).json({ success: false, error: 'Forbidden: Invalid token' });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Auth error' });
  }
}

module.exports = { adminAuthMiddleware };
