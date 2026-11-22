const { getAuth, getDb } = require('../config/firebase');
const { expirePremiumIfNeeded } = require('../services/premiumService');

// Cache profil user di memori (per instance serverless) supaya tiap request tidak
// selalu membaca database. Pendek (15 dtk) agar suspend/ubah role cepat berlaku.
const USER_CACHE_TTL_MS = 15 * 1000;
const userCache = new Map();

function readUserCache(uid) {
  const hit = userCache.get(uid);
  if (!hit) return null;
  if (Date.now() - hit.t > USER_CACHE_TTL_MS) { userCache.delete(uid); return null; }
  return hit.v;
}

function writeUserCache(uid, value) {
  if (userCache.size > 500) userCache.clear();
  userCache.set(uid, { t: Date.now(), v: value });
}

function invalidateUser(uid) {
  if (uid) userCache.delete(uid);
}

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

    // Role & status dari database (source of truth), dengan cache pendek.
    // Hanya field yang dibutuhkan yang dibaca (bukan seluruh node users/{uid}).
    let userData = readUserCache(uid);
    if (!userData) {
      const db = getDb();
      const f = (k) => db.ref(`users/${uid}/${k}`).once('value').then((x) => x.val());
      const [role, status, name, email, premiumExpiresAt] = await Promise.all([
        f('role'), f('status'), f('name'), f('email'), f('premiumExpiresAt'),
      ]);
      if (role === null && status === null && email === null) {
        return res.status(401).json({ success: false, message: 'Akun tidak ditemukan' });
      }
      userData = { role, status, name, email, premiumExpiresAt };
      // Premium habis -> otomatis jadi user biasa
      userData = await expirePremiumIfNeeded(db, uid, userData);
      writeUserCache(uid, userData);
    }

    // Bootstrap owner: akun dengan UID = OWNER_UID otomatis jadi owner
    if (process.env.OWNER_UID && uid === process.env.OWNER_UID && userData.role !== 'owner') {
      userData = { ...userData, role: 'owner' };
      writeUserCache(uid, userData);
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

module.exports = { verifyToken, verifyTokenOnly, requireRole, requireMinRole, invalidateUser };
