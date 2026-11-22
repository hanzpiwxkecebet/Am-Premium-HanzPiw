const { getDb, getAuth } = require('../config/firebase');
const { v4: uuidv4 } = require('uuid');

const DEFAULT_LIMIT = parseInt(process.env.DEFAULT_DAILY_LIMIT) || 20;
const OWNER_UID = process.env.OWNER_UID;
const { getDefaultLimit } = require('../services/limitService');
const { providerFromRecord } = require('../services/providerService');
const { expirePremiumIfNeeded } = require('../services/premiumService');
const photos = require('../services/photoService');
const axios = require('axios');

const ROLE_HIERARCHY = { user: 0, premium: 1, moderator: 2, admin: 3, owner: 4 };

// Metode daftar dari token Firebase: 'google' (Sign in with Google) atau 'email' (email + password)
function providerFromDecoded(decoded) {
  const p = decoded && decoded.firebase && decoded.firebase.sign_in_provider;
  return p === 'google.com' ? 'google' : 'email';
}

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const USERNAME_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // ganti username maksimal 1x per 7 hari
const LOGIN_METHODS = ['google', 'email', 'username'];

// Foto profil disimpan sebagai data URL kecil (sudah di-resize di browser).
// photoURL = 256px (halaman profil), photoThumb = 64px (tabel admin, supaya daftar user tetap ringan).
const PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;
const PHOTO_MAX_LEN = 150000;
const THUMB_MAX_LEN = 15000;

function cleanUsername(base) {
  return String(base || 'user').toLowerCase().replace(/[^a-z0-9_]/g, '').substring(0, 14) || 'user';
}

/**
 * Buat profil user baru di database (profil + mapping username).
 */
async function createProfile(db, { uid, name, username, email, provider }) {
  const role = OWNER_UID && uid === OWNER_UID ? 'owner' : 'user';
  const userData = {
    name: String(name || email || 'Pengguna').trim().substring(0, 50),
    username,
    email: String(email || '').toLowerCase().trim(),
    role,
    status: 'active',
    provider: provider || 'email',
    createdAt: Date.now(),
    dailyLimit: await getDefaultLimit(),
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
  if (!USERNAME_RE.test(usernameClean)) {
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
    if (!old.provider) updates[`users/${uid}/provider`] = providerFromDecoded(decoded);
    await db.ref('/').update(updates);
    return res.status(200).json({ success: true, message: 'Registrasi berhasil', data: { uid, role: old.role || 'user' } });
  }

  const userData = await createProfile(db, { uid, name, username: usernameClean, email, provider: providerFromDecoded(decoded) });
  return res.status(201).json({ success: true, message: 'Registrasi berhasil', data: { uid, role: userData.role } });
}

/**
 * Cek apakah username masih bebas (dipakai form daftar). TIDAK mengembalikan data akun apa pun.
 */
async function checkUsernameAvailable(req, res) {
  const usernameClean = String(req.query.username || '').toLowerCase().trim();
  if (!USERNAME_RE.test(usernameClean)) {
    return res.status(400).json({ success: false, message: 'Username harus 3-20 karakter (huruf, angka, underscore)' });
  }
  const snap = await getDb().ref(`usernames/${usernameClean}`).once('value');
  return res.json({ success: true, available: !snap.exists() });
}

const LOGIN_FAIL_MSG = 'Username atau password salah';

/**
 * Login memakai username. Email TIDAK pernah dikirim ke klien (sebelumnya GET /username membocorkan email
 * siapa pun yang usernamenya ditebak). Alur: server mencari email -> memverifikasi password lewat Firebase Auth REST
 * -> mengembalikan custom token; klien login dengan signInWithCustomToken.
 */
async function loginWithUsername(req, res) {
  const username = String((req.body && req.body.username) || '').toLowerCase().trim();
  const password = String((req.body && req.body.password) || '');
  if (!USERNAME_RE.test(username) || !password || password.length > 128) {
    return res.status(400).json({ success: false, message: LOGIN_FAIL_MSG });
  }
  const apiKey = String(process.env.FIREBASE_API_KEY || '').trim();
  if (!apiKey) return res.status(503).json({ success: false, message: 'Server belum dikonfigurasi' });

  const db = getDb();
  const mapSnap = await db.ref(`usernames/${username}`).once('value');
  const uid = mapSnap.exists() ? mapSnap.val().uid : null;
  const emailSnap = uid ? await db.ref(`users/${uid}/email`).once('value') : null;
  const email = emailSnap && emailSnap.val();
  if (!uid || !email) return res.status(401).json({ success: false, message: LOGIN_FAIL_MSG });

  let r;
  try {
    const headers = { 'Content-Type': 'application/json' };
    // Kalau API key dibatasi per "HTTP referrer", panggilan dari server perlu Referer yang sah
    if (process.env.APP_URL) headers.Referer = String(process.env.APP_URL).replace(/\/+$/, '') + '/';
    r = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
      { email, password, returnSecureToken: false },
      { timeout: 8000, validateStatus: () => true, headers }
    );
  } catch (e) {
    return res.status(502).json({ success: false, message: 'Layanan login tidak merespons, coba lagi' });
  }

  if (r.status !== 200) {
    const code = String(r.data && r.data.error && r.data.error.message || '');
    if (code.startsWith('TOO_MANY_ATTEMPTS')) {
      return res.status(429).json({ success: false, message: 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi' });
    }
    if (code.startsWith('USER_DISABLED')) {
      return res.status(403).json({ success: false, message: 'Akun ini dinonaktifkan' });
    }
    if (r.status >= 500 || /API_KEY|REFERER|PROJECT/i.test(code)) {
      console.error('[Auth] signInWithPassword gagal:', r.status, code);
      return res.status(502).json({ success: false, message: 'Layanan login bermasalah, coba lagi' });
    }
    return res.status(401).json({ success: false, message: LOGIN_FAIL_MSG });
  }

  const token = await getAuth().createCustomToken(uid);
  return res.json({ success: true, data: { customToken: token } });
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
    await createProfile(db, { uid, name: decoded.name || email, username, email, provider: providerFromDecoded(decoded) });
    snap = await db.ref(`users/${uid}`).once('value');
  }

  let data = snap.val();

  // Foto: node terpisah. Data lama (foto di dalam users/{uid}) dipindah otomatis sekali.
  let photoURL = '';
  const moved = await photos.migrateLegacyPhoto(db, uid, data).catch(() => null);
  if (moved) {
    photoURL = moved.photoURL;
  } else {
    photoURL = await photos.getPhoto(db, uid).catch(() => '');
  }
  delete data.photoURL;
  delete data.photoThumb;

  // Premium habis -> turunkan ke user
  data = await expirePremiumIfNeeded(db, uid, data);

  // Profil lama belum punya data metode daftar: isi dari token login saat ini (best effort)
  if (!data.provider || data.provider === 'unknown') {
    let provider = providerFromDecoded(req.decoded);
    try { provider = providerFromRecord(await getAuth().getUser(uid)); } catch (e) { /* pakai tebakan dari token */ }
    data.provider = provider;
    db.ref(`users/${uid}/provider`).set(provider).catch(() => {});
  }
  if (OWNER_UID && uid === OWNER_UID && data.role !== 'owner') {
    data.role = 'owner';
    await db.ref(`users/${uid}/role`).set('owner');
  }
  // Never send sensitive fields
  delete data.usedToday;
  return res.json({ success: true, data: { ...data, photoURL, uid } });
}

/**
 * Update profile (name, foto profil)
 * Foto: kirim photoURL (256px) + photoThumb (64px) sebagai data URL gambar, atau string kosong untuk menghapus.
 */
async function updateProfile(req, res) {
  const { uid } = req.user;
  const { name, photoURL, photoThumb } = req.body;
  const updates = {};

  if (name !== undefined) {
    const clean = String(name).trim().substring(0, 50);
    if (clean.length < 2) return res.status(400).json({ success: false, message: 'Nama terlalu pendek' });
    updates.name = clean;
  }

  let photoChange = null; // null | { main, thumb }
  if (photoURL !== undefined || photoThumb !== undefined) {
    const removing = photoURL === '' && (photoThumb === '' || photoThumb === undefined);
    if (removing) {
      photoChange = { main: '', thumb: '' };
    } else {
      const okMain = typeof photoURL === 'string' && photoURL.length <= PHOTO_MAX_LEN && PHOTO_RE.test(photoURL);
      const okThumb = typeof photoThumb === 'string' && photoThumb.length <= THUMB_MAX_LEN && PHOTO_RE.test(photoThumb);
      if (!okMain || !okThumb) {
        return res.status(400).json({ success: false, message: 'Foto tidak valid. Gunakan gambar JPG, PNG, atau WebP.' });
      }
      photoChange = { main: photoURL, thumb: photoThumb };
    }
  }

  if (Object.keys(updates).length === 0 && !photoChange) {
    return res.status(400).json({ success: false, message: 'Tidak ada data yang diperbarui' });
  }
  const db = getDb();
  if (photoChange) await photos.setPhoto(db, uid, photoChange.main, photoChange.thumb);
  if (Object.keys(updates).length) await db.ref(`users/${uid}`).update(updates);
  return res.json({ success: true, message: 'Profil berhasil diperbarui' });
}

/**
 * Ganti username. Aturan: 3-20 karakter (huruf kecil, angka, underscore), unik,
 * dan hanya boleh diganti sekali tiap 7 hari. Berlaku untuk semua metode daftar (termasuk Google).
 */
async function updateUsername(req, res) {
  const { uid } = req.user;
  const next = String((req.body && req.body.username) || '').toLowerCase().trim();
  if (!USERNAME_RE.test(next)) {
    return res.status(400).json({ success: false, message: 'Username harus 3-20 karakter (huruf, angka, underscore)' });
  }

  const db = getDb();
  const userSnap = await db.ref(`users/${uid}`).once('value');
  if (!userSnap.exists()) return res.status(404).json({ success: false, message: 'Profil tidak ditemukan' });
  const user = userSnap.val();

  if (user.username === next) {
    return res.status(400).json({ success: false, message: 'Itu sudah username kamu sekarang' });
  }

  // Owner tidak dikenai cooldown
  const isOwner = user.role === 'owner';
  const last = Number(user.usernameChangedAt) || 0;
  const waitMs = last + USERNAME_COOLDOWN_MS - Date.now();
  if (!isOwner && waitMs > 0) {
    const days = Math.ceil(waitMs / (24 * 60 * 60 * 1000));
    return res.status(429).json({ success: false, message: `Username baru bisa diganti lagi dalam ${days} hari` });
  }

  // Klaim username secara atomik supaya dua user tidak bisa mengambil nama yang sama bersamaan
  const claim = await db.ref(`usernames/${next}`).transaction((cur) => (cur ? undefined : { uid }));
  if (!claim.committed) {
    const owner = claim.snapshot && claim.snapshot.val();
    if (!owner || owner.uid !== uid) {
      return res.status(409).json({ success: false, message: 'Username sudah digunakan' });
    }
  }

  try {
    const updates = {};
    updates[`users/${uid}/username`] = next;
    updates[`users/${uid}/usernameChangedAt`] = Date.now();
    if (user.username) updates[`usernames/${user.username}`] = null;
    await db.ref('/').update(updates);
  } catch (err) {
    // Gagal menyimpan: lepaskan klaim supaya username baru tidak "nyangkut"
    await db.ref(`usernames/${next}`).remove().catch(() => {});
    throw err;
  }
  return res.json({ success: true, message: 'Username diperbarui', data: { username: next } });
}

/**
 * Catat metode login terakhir (google / email / username) untuk tampilan di dashboard admin.
 * Best effort: kalau profil belum ada (login pertama), diabaikan.
 */
async function recordLoginMethod(req, res) {
  const { uid } = req.user;
  const method = String((req.body && req.body.method) || '');
  if (!LOGIN_METHODS.includes(method)) {
    return res.status(400).json({ success: false, message: 'Metode login tidak valid' });
  }
  const db = getDb();
  const snap = await db.ref(`users/${uid}`).once('value');
  if (!snap.exists()) return res.json({ success: true, skipped: true });
  await db.ref(`users/${uid}`).update({ lastLoginMethod: method, lastLoginAt: Date.now() });
  return res.json({ success: true });
}

/**
 * Check if user is admin or owner (used for frontend routing)
 */
async function getRole(req, res) {
  return res.json({ success: true, role: req.user.role });
}

module.exports = { registerUser, checkUsernameAvailable, loginWithUsername, getProfile, updateProfile, updateUsername, recordLoginMethod, getRole };
