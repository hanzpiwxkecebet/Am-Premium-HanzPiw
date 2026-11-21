const { getAuth, getDb } = require('../config/firebase');

/**
 * Verifies Firebase ID token from Authorization header.
 * Attaches { uid, role, status, name, email } to req.user
 */
async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Token tidak ditemukan' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = await getAuth().verifyIdToken(token);
    const uid = decoded.uid;

    // Fetch role and status from database (source of truth)
    const snap = await getDb().ref(`users/${uid}`).once('value');
    if (!snap.exists()) {
      return res.status(401).json({ success: false, message: 'Akun tidak ditemukan' });
    }
    const userData = snap.val();

    // Bootstrap owner: akun dengan UID = OWNER_UID otomatis jadi owner
    if (process.env.OWNER_UID && uid === process.env.OWNER_UID && userData.role !== 'owner') {
      userData.role = 'owner';
      await getDb().ref(`users/${uid}/role`).set('owner');
    }

    if (userData.status === 'suspended') {
      return res.status(403).json({ success: false, message: 'Akun kamu disuspend' });
    }

    req.user = {
      uid,
      role: userData.role || 'user',
      status: userData.status || 'active',
      name: userData.name,
      email: userData.email,
    };
    next();
  } catch (err) {
    console.error('[Auth] Token verification failed:', err.message);
    return res.status(401).json({ success: false, message: 'Token tidak valid atau kedaluwarsa' });
  }
}

/**
 * Hanya memverifikasi token Firebase (tanpa mewajibkan profil ada di database).
 * Dipakai untuk register dan pengambilan profil pertama kali.
 * Attaches req.user = { uid } dan req.decoded = token yang sudah didecode.
 */
async function verifyTokenOnly(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Token tidak ditemukan' });
  }
  try {
    const decoded = await getAuth().verifyIdToken(authHeader.split(' ')[1]);
    req.user = { uid: decoded.uid };
    req.decoded = decoded;
    next();
  } catch (err) {
    console.error('[Auth] Token verification failed:', err.message);
    return res.status(401).json({ success: false, message: 'Token tidak valid atau kedaluwarsa' });
  }
}

/**
 * Role-based access control middleware factory.
 * Usage: requireRole('admin'), requireRole(['admin','owner'])
 */
function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Tidak terautentikasi' });
    }
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Akses ditolak: izin tidak cukup' });
    }
    next();
  };
}

const ROLE_HIERARCHY = { user: 0, premium: 1, moderator: 2, admin: 3, owner: 4 };

function requireMinRole(minRole) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Tidak terautentikasi' });
    }
    const userLevel = ROLE_HIERARCHY[req.user.role] ?? -1;
    const minLevel = ROLE_HIERARCHY[minRole] ?? 99;
    if (userLevel < minLevel) {
      return res.status(403).json({ success: false, message: 'Akses ditolak: izin tidak cukup' });
    }
    next();
  };
}

module.exports = { verifyToken, verifyTokenOnly, requireRole, requireMinRole };
