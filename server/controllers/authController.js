const { getDb, getAuth } = require('../config/firebase');
const { v4: uuidv4 } = require('uuid');

const DEFAULT_LIMIT = parseInt(process.env.DEFAULT_DAILY_LIMIT) || 20;
const OWNER_UID = process.env.OWNER_UID;

const ROLE_HIERARCHY = { user: 0, premium: 1, moderator: 2, admin: 3, owner: 4 };

/**
 * Register new user (called after Firebase client-side registration)
 * Saves user profile to Realtime Database
 */
async function registerUser(req, res) {
  const { uid, name, username, email } = req.body;

  if (!uid || !name || !username || !email) {
    return res.status(400).json({ success: false, message: 'Data registrasi tidak lengkap' });
  }

  const usernameClean = username.toLowerCase().trim();
  if (!/^[a-z0-9_]{3,20}$/.test(usernameClean)) {
    return res.status(400).json({ success: false, message: 'Username harus 3-20 karakter (huruf, angka, underscore)' });
  }

  const db = getDb();

  // Check username uniqueness
  const usernameSnap = await db.ref(`usernames/${usernameClean}`).once('value');
  if (usernameSnap.exists()) {
    return res.status(409).json({ success: false, message: 'Username sudah digunakan' });
  }

  // Determine role (owner bootstrap)
  const role = uid === OWNER_UID ? 'owner' : 'user';

  const userData = {
    name: name.trim(),
    username: usernameClean,
    email: email.toLowerCase().trim(),
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

  // Write atomically: user profile + username mapping
  const updates = {};
  updates[`users/${uid}`] = userData;
  updates[`usernames/${usernameClean}`] = { uid };
  await db.ref('/').update(updates);

  return res.status(201).json({ success: true, message: 'Registrasi berhasil', data: { uid, role } });
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
 * Get current user profile
 */
async function getProfile(req, res) {
  const { uid } = req.user;
  const snap = await getDb().ref(`users/${uid}`).once('value');
  if (!snap.exists()) return res.status(404).json({ success: false, message: 'Profil tidak ditemukan' });
  const data = snap.val();
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
