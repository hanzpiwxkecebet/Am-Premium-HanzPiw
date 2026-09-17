const { getAdmin } = require('../firebase/config');

async function userAuthMiddleware(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ success: false, error: 'Login diperlukan untuk menggunakan generator.', code: 'AUTH_REQUIRED' });
  }
  try {
    const admin = getAdmin();
    if (!admin || !admin.apps.length) return next(); // Firebase not configured, skip
    const decoded = await admin.auth().verifyIdToken(token);
    req.uid = decoded.uid;
    req.userEmail = decoded.email;
    next();
  } catch (e) {
    return res.status(401).json({ success: false, error: 'Sesi tidak valid. Silakan login ulang.', code: 'INVALID_TOKEN' });
  }
}

module.exports = { userAuthMiddleware };
