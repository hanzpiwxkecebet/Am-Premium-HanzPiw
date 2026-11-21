const { getDb, getAuth } = require('../config/firebase');
const { v4: uuidv4 } = require('uuid');

const DEFAULT_LIMIT = parseInt(process.env.DEFAULT_DAILY_LIMIT) || 20;
const OWNER_UID = process.env.OWNER_UID;

const ROLE_HIERARCHY = { user: 0, premium: 1, moderator: 2, admin: 3, owner: 4 };

function cleanUsername(base) {
  return String(base || 'user').toLowerCase().replace(/[^a-z0-9_]/g, '').substring(0, 14) || 'user';
}

/**
 * Buat profil user baru di database (profil + mapping username).
 */
async function createProfile(db, { uid, name, username, email }) {
  const role = OWNER_UID && uid === OWNER_UID ? 'owner' : 'user';
  const userData = {
    name: String(name || email || 'Pengguna').trim().substring(0, 50),
    username,
    email: String(email || '').toLowerCase().trim(),
    role,
    status: 'active',
    photoURL: '',
    createdAt: Date.now(),
    dailyLimit: DEFAULT_LIMIT,
    usedToday: 0,
    lastResetDate: '',
    totalUsage: 0,
    totalSuccess: 0,
    totalFailed: 0,
  };
  const updates = {};
  updates[`users/${uid}`] = userData;
  updates[`usernames/${username}`] = { uid };
  await db.ref('/').update(updates);
  return userData;
}

/**
 * Register new user (called after Firebase client-side registration)
 * Saves user profile to Realtime Database
 */
async function registerUser(req, res) {
  const { uid, name, username } = req.body;
  const decoded = req.decoded || {};

  if (!uid || !name || !username) {
    return res.status(400).json({ success: false, message: 'Data registrasi tidak lengkap' });
  }
  if (decoded.uid && uid !== decoded.uid) {
    return res.status(403).json({ success: false, message: 'UID tidak cocok dengan akun yang login' });
  }
  const email = decoded.email || req.body.email;
  if (!email) {
    return res.status(400).json({ success: false, message: 'Email tidak ditemukan' });
  }

  const usernameClean = String(username).toLowerCase().trim();
  if (!/^[a-z0-9_]{3,20}$/.test(usernameClean)) {
    return res.status(400).json({ success: false, message: 'Username harus 3-20 karakter (huruf, angka, underscore)' });
  }

  const db = getDb();

  // Check username uniqueness (boleh kalau milik uid ini sendiri)
  const usernameSnap = await db.ref(`usernames/${usernameClean}`).once('value');
  if (usernameSnap.exists() && usernameSnap.val().uid !== uid) {
    return res.status(409).json({ success: false, message: 'Username sudah digunakan' });
  }

  // Profil mungkin sudah dibuat otomatis (race dengan getProfile): perbarui saja
  const existingSnap = await db.ref(`users/${uid}`).once('value');
  if (existingSnap.exists()) {
    const old = existingSnap.val();
    const updates = {};
    if (old.username && old.username !== usernameClean) updates[`usernames/${old.username}`] = null;
    updates[`usernames/${usernameClean}`] = { uid };
    updates[`users/${uid}/username`] = usernameClean;
    updates[`users/${uid}/name`] = String(name).trim().substring(0, 50);
    await db.ref('/').update(updates);
    return res.status(200).json({ success: true, message: 'Registrasi berhasil', data: { uid, role: old.role || 'user' } });
  }

  const userData = await createProfile(db, { uid, name, username: usernameClean, email });
  return res.status(201).json({ success: true, message: 'Registrasi berhasil', data: { uid, role: userData.role } });
}

/**
 * Get username -> UID mapping for username login (client does the actual auth)
 */
async function getUserByUsername(req, res) {
  const { username } = req.query;
  if (!username) return res.status(400).json({ success: false, message: 'Username diperlukan' });

  const usernameClean = username.toLowerCase().trim();
  const db = getDb();
  const snap = await db.ref(`usernames/${usernameClean}`).once('value');

  if (!snap.exists()) {
    return res.status(404).json({ success: false, message: 'Username tidak ditemukan' });
  }

  const { uid } = snap.val();
  const userSnap = await db.ref(`users/${uid}`).once('value');
  if (!userSnap.exists()) {
    return res.status(404).json({ success: false, message: 'Akun tidak ditemukan' });
  }
  const user = userSnap.val();
  return res.json({ success: true, data: { uid, email: user.email } });
}

/**
 * Get current user profile.
 * Kalau profil belum ada (mis. login Google pertama kali), dibuat otomatis.
 */
async function getProfile(req, res) {
  const { uid } = req.user;
  const db = getDb();
  let snap = await db.ref(`users/${uid}`).once('value');

  if (!snap.exists()) {
    const decoded = req.decoded || {};
    const email = decoded.email;
    if (!email) {
      return res.status(404).json({ success: false, message: 'Profil tidak ditemukan' });
    }
    // Cari username unik dari email
    const base = cleanUsername(email.split('@')[0]);
    let username = null;
    for (let i = 0; i < 8 && !username; i++) {
      const candidate = base + (i === 0 ? '' : Math.floor(Math.random() * 9999));
      const taken = await db.ref(`usernames/${candidate}`).once('value');
      if (!taken.exists() && candidate.length >= 3) username = candidate;
    }
    if (!username) username = `user${Date.now().toString(36)}`.substring(0, 20);
    await createProfile(db, { uid, name: decoded.name || email, username, email });
    snap = await db.ref(`users/${uid}`).once('value');
  }

  const data = snap.val();
  if (OWNER_UID && uid === OWNER_UID && data.role !== 'owner') {
    data.role = 'owner';
    await db.ref(`users/${uid}/role`).set('owner');
  }
  // Never send sensitive fields
  delete data.usedToday;
  return res.json({ success: true, data: { ...data, uid } });
}

/**
 * Update profile (name, photoURL)
 */
async function updateProfile(req, res) {
  const { uid } = req.user;
  const { name, photoURL } = req.body;
  const updates = {};
  if (name) updates.name = name.trim().substring(0, 50);
  if (photoURL !== undefined) updates.photoURL = photoURL;
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ success: false, message: 'Tidak ada data yang diperbarui' });
  }
  await getDb().ref(`users/${uid}`).update(updates);
  return res.json({ success: true, message: 'Profil berhasil diperbarui' });
}

/**
 * Check if user is admin or owner (used for frontend routing)
 */
async function getRole(req, res) {
  return res.json({ success: true, role: req.user.role });
}

module.exports = { registerUser, getUserByUsername, getProfile, updateProfile, getRole };
