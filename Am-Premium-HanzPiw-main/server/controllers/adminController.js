const { getDb, getAuth } = require('../config/firebase');
const { invalidateUser } = require('../middleware/auth');
const { logAction } = require('../services/auditService');
const { getTodayJakarta, clearDefaultLimitCache } = require('../services/limitService');
const { checkApiStatus } = require('../services/apiService');
const { lookupProviders } = require('../services/providerService');
const { v4: uuidv4 } = require('uuid');

const ROLE_HIERARCHY = { user: 0, premium: 1, moderator: 2, admin: 3, owner: 4 };
const OWNER_UID = process.env.OWNER_UID;

function canManageRole(actorRole, targetRole) {
  return ROLE_HIERARCHY[actorRole] > ROLE_HIERARCHY[targetRole];
}

// ─── USER MANAGEMENT ─────────────────────────────────────────────────────────

/**
 * Isi otomatis `provider` untuk user lama yang belum punya (backfill dari Firebase Auth).
 * Hanya jalan kalau ada user yang belum terisi; hasilnya disimpan jadi request berikutnya tidak perlu lagi.
 * Gagal = diabaikan (daftar user tetap tampil, provider kosong).
 */
async function backfillProviders(db, snap) {
  const missing = [];
  snap.forEach(child => { if (!child.val().provider) missing.push(child.key); });
  if (!missing.length) return {};
  try {
    const found = await lookupProviders(getAuth(), missing);
    const updates = {};
    for (const uid of missing) updates[`users/${uid}/provider`] = found[uid];
    await db.ref('/').update(updates);
    return found;
  } catch (err) {
    console.error('[Admin] Backfill provider gagal:', err.message);
    return {};
  }
}

async function getUsers(req, res) {
  const db = getDb();
  const snap = await db.ref('users').once('value');
  const filled = await backfillProviders(db, snap);
  const today = getTodayJakarta();
  const users = [];
  snap.forEach(child => {
    const u = child.val();
    users.push({
      uid: child.key,
      name: u.name,
      username: u.username,
      email: u.email,
      role: u.role,
      status: u.status,
      createdAt: u.createdAt,
      dailyLimit: u.dailyLimit,
      // Metode daftar & login terakhir (untuk ikon di dashboard admin)
      provider: u.provider || filled[child.key] || 'unknown',
      lastLoginMethod: u.lastLoginMethod || null,
      // Hanya thumbnail kecil (64px) yang dikirim ke daftar user; foto penuh tidak ikut supaya respons tetap ringan
      photoThumb: u.photoThumb || '',
      // usedToday hanya berlaku kalau tanggal reset = hari ini
      usedToday: u.lastResetDate === today ? (u.usedToday || 0) : 0,
      totalUsage: u.totalUsage || 0,
    });
  });
  users.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return res.json({ success: true, data: users });
}

async function getUserDetail(req, res) {
  const { uid } = req.params;
  const snap = await getDb().ref(`users/${uid}`).once('value');
  if (!snap.exists()) return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
  const data = snap.val();
  delete data.usedToday;
  delete data.photoURL; // foto penuh tidak perlu di detail admin (cukup photoThumb)
  return res.json({ success: true, data: { ...data, uid } });
}

async function updateUserRole(req, res) {
  const { uid } = req.params;
  const { role } = req.body;
  const actor = req.user;

  const validRoles = ['user', 'premium', 'moderator', 'admin', 'owner'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ success: false, message: 'Role tidak valid' });
  }

  // Cannot set role to owner via API
  if (role === 'owner') {
    return res.status(403).json({ success: false, message: 'Tidak bisa mengangkat Owner melalui API' });
  }

  // Cannot change own role
  if (uid === actor.uid) {
    return res.status(403).json({ success: false, message: 'Tidak bisa mengubah role diri sendiri' });
  }

  const db = getDb();
  const targetSnap = await db.ref(`users/${uid}`).once('value');
  if (!targetSnap.exists()) return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
  const target = targetSnap.val();

  if (!canManageRole(actor.role, target.role)) {
    return res.status(403).json({ success: false, message: 'Tidak bisa mengelola role yang lebih tinggi' });
  }
  if (!canManageRole(actor.role, role) && role !== 'user') {
    if (ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[actor.role]) {
      return res.status(403).json({ success: false, message: 'Tidak bisa mengangkat ke role yang sama atau lebih tinggi' });
    }
  }

  await db.ref(`users/${uid}`).update({ role });
  invalidateUser(uid);
  await logAction({ actorUID: actor.uid, actorRole: actor.role, action: 'update_role', targetUID: uid, targetUsername: target.username, summary: `${target.username} role changed to ${role}` });
  return res.json({ success: true, message: `Role ${target.username} diubah ke ${role}` });
}

async function updateUserLimit(req, res) {
  const { uid } = req.params;
  const { limit, adjustment } = req.body;
  const actor = req.user;

  const db = getDb();
  const targetSnap = await db.ref(`users/${uid}`).once('value');
  if (!targetSnap.exists()) return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
  const target = targetSnap.val();

  // Bisa set langsung (limit) atau tambah/kurangi (adjustment)
  let newLimit = limit;
  if (newLimit === undefined && adjustment !== undefined) {
    newLimit = (target.dailyLimit ?? 20) + Number(adjustment);
  }
  newLimit = Number(newLimit);
  if (!Number.isFinite(newLimit) || newLimit < 0) {
    return res.status(400).json({ success: false, message: 'Limit harus angka positif' });
  }

  await db.ref(`users/${uid}`).update({ dailyLimit: newLimit });
  await logAction({ actorUID: actor.uid, actorRole: actor.role, action: 'update_limit', targetUID: uid, targetUsername: target.username, summary: `Limit set to ${newLimit}` });
  return res.json({ success: true, message: `Limit ${target.username} diubah ke ${newLimit}` });
}

async function suspendUser(req, res) {
  const { uid } = req.params;
  const actor = req.user;

  if (uid === actor.uid) {
    return res.status(403).json({ success: false, message: 'Tidak bisa suspend diri sendiri' });
  }

  const db = getDb();
  const targetSnap = await db.ref(`users/${uid}`).once('value');
  if (!targetSnap.exists()) return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
  const target = targetSnap.val();

  if (!canManageRole(actor.role, target.role)) {
    return res.status(403).json({ success: false, message: 'Tidak bisa suspend user dengan role lebih tinggi' });
  }

  await db.ref(`users/${uid}`).update({ status: 'suspended' });
  invalidateUser(uid);
  await logAction({ actorUID: actor.uid, actorRole: actor.role, action: 'suspend_user', targetUID: uid, targetUsername: target.username, summary: 'Account suspended' });
  return res.json({ success: true, message: `Akun ${target.username} disuspend` });
}

async function activateUser(req, res) {
  const { uid } = req.params;
  const actor = req.user;

  const db = getDb();
  const targetSnap = await db.ref(`users/${uid}`).once('value');
  if (!targetSnap.exists()) return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
  const target = targetSnap.val();

  await db.ref(`users/${uid}`).update({ status: 'active' });
  invalidateUser(uid);
  await logAction({ actorUID: actor.uid, actorRole: actor.role, action: 'activate_user', targetUID: uid, targetUsername: target.username, summary: 'Account activated' });
  return res.json({ success: true, message: `Akun ${target.username} diaktifkan` });
}

// ─── REDEEM MANAGEMENT ───────────────────────────────────────────────────────

async function createRedeemCode(req, res) {
  const { code, type, value, maxUses, expiresAt, label } = req.body;
  const actor = req.user;

  const validTypes = ['limit', 'premium', 'special'];
  if (!validTypes.includes(type)) return res.status(400).json({ success: false, message: 'Tipe kode tidak valid' });
  if (value === undefined || value === null || String(value).trim() === '') {
    return res.status(400).json({ success: false, message: 'Value kode diperlukan' });
  }
  // limit & premium harus angka positif (kalau tidak, user yang redeem bisa kena NaN)
  if ((type === 'limit' || type === 'premium') && !(Number(value) > 0)) {
    return res.status(400).json({ success: false, message: 'Value untuk tipe limit/premium harus angka lebih dari 0' });
  }

  // Kode custom (opsional) atau auto-generate
  let codeId;
  const custom = typeof code === 'string' ? code.trim().toUpperCase() : '';
  if (custom) {
    if (!/^[A-Z0-9]{4,20}$/.test(custom)) {
      return res.status(400).json({ success: false, message: 'Kode harus 4-20 karakter (huruf besar & angka)' });
    }
    codeId = custom;
  } else {
    codeId = uuidv4().split('-')[0].toUpperCase() + uuidv4().split('-')[1].toUpperCase();
  }

  const db = getDb();
  const existing = await db.ref(`redeem/${codeId}`).once('value');
  if (existing.exists()) return res.status(409).json({ success: false, message: 'Kode sudah ada' });

  // maxUses: 0 = tidak terbatas
  const maxUsesNum = Number(maxUses);
  const maxUsesFinal = Number.isFinite(maxUsesNum) && maxUsesNum >= 0 ? Math.floor(maxUsesNum) : 1;

  // expiresAt boleh timestamp (angka) atau tanggal YYYY-MM-DD (berlaku sampai akhir hari WIB)
  let expiresAtFinal = null;
  if (typeof expiresAt === 'number' && Number.isFinite(expiresAt)) {
    expiresAtFinal = expiresAt;
  } else if (typeof expiresAt === 'string' && expiresAt.trim()) {
    const raw = expiresAt.trim();
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? Date.parse(`${raw}T23:59:59+07:00`) : Date.parse(raw);
    if (!Number.isFinite(parsed)) {
      return res.status(400).json({ success: false, message: 'Tanggal kedaluwarsa tidak valid' });
    }
    expiresAtFinal = parsed;
  }

  await db.ref(`redeem/${codeId}`).set({
    type,
    value: (type === 'limit' || type === 'premium') ? Number(value) : String(value),
    label: label ? String(label).substring(0, 50) : '',
    active: true,
    maxUses: maxUsesFinal,
    usedCount: 0,
    expiresAt: expiresAtFinal,
    createdAt: Date.now(),
    createdBy: actor.uid,
  });

  await logAction({ actorUID: actor.uid, actorRole: actor.role, action: 'create_redeem', summary: `Created ${type} code ${codeId}` });
  return res.status(201).json({ success: true, message: 'Kode redeem dibuat', data: { codeId, code: codeId } });
}

async function getRedeemCodes(req, res) {
  const db = getDb();
  const snap = await db.ref('redeem').once('value');
  const codes = [];
  snap.forEach(child => {
    const v = child.val();
    codes.push({ id: child.key, code: child.key, ...v, isActive: v.active === true });
  });
  codes.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return res.json({ success: true, data: codes });
}

async function deleteRedeemCode(req, res) {
  const { id } = req.params;
  const actor = req.user;
  const db = getDb();
  const snap = await db.ref(`redeem/${id}`).once('value');
  if (!snap.exists()) return res.status(404).json({ success: false, message: 'Kode tidak ditemukan' });
  await db.ref(`redeem/${id}`).remove();
  await logAction({ actorUID: actor.uid, actorRole: actor.role, action: 'delete_redeem', summary: `Deleted code ${id}` });
  return res.json({ success: true, message: 'Kode dihapus' });
}

async function updateRedeemCode(req, res) {
  const { id } = req.params;
  const updates = {};
  const allowed = ['active', 'maxUses', 'expiresAt', 'label'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  if (Object.keys(updates).length === 0) return res.status(400).json({ success: false, message: 'Tidak ada yang diupdate' });

  const db = getDb();
  const snap = await db.ref(`redeem/${id}`).once('value');
  if (!snap.exists()) return res.status(404).json({ success: false, message: 'Kode tidak ditemukan' });
  await db.ref(`redeem/${id}`).update(updates);
  return res.json({ success: true, message: 'Kode diperbarui' });
}

// ─── EMAIL MANAGEMENT ────────────────────────────────────────────────────────

async function getEmails(req, res) {
  const db = getDb();
  const snap = await db.ref('emails').once('value');
  const emails = [];
  snap.forEach(child => emails.push({ id: child.key, ...child.val() }));
  return res.json({ success: true, data: emails });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BULK_EMAIL_MAX = 200;

/**
 * Tambah email sistem. Mendukung:
 *  - satu email:  { email, label }
 *  - bulk:        { emails: "a@x.com\nb@x.com, c@x.com" | ["a@x.com", ...], label }
 * Pemisah: baris baru, koma, titik koma, atau spasi. Maksimal 200 email sekali tambah.
 * Duplikat / tidak valid dilewati dan dilaporkan di ringkasan.
 */
async function addEmail(req, res) {
  const { email, emails, label } = req.body;
  const raw = emails !== undefined ? emails : email;
  const tokens = (Array.isArray(raw) ? raw.map(String).join('\n') : String(raw || ''))
    .split(/[\s,;]+/)
    .map(t => t.trim().toLowerCase())
    .filter(Boolean);

  if (!tokens.length) {
    return res.status(400).json({ success: false, message: 'Masukkan minimal 1 alamat email' });
  }
  if (tokens.length > BULK_EMAIL_MAX) {
    return res.status(400).json({ success: false, message: `Maksimal ${BULK_EMAIL_MAX} email sekali tambah (kamu memasukkan ${tokens.length})` });
  }

  const db = getDb();
  const existingSnap = await db.ref('emails').once('value');
  const existing = new Set();
  existingSnap.forEach(child => { const e = child.val().email; if (e) existing.add(String(e).toLowerCase()); });

  const cleanLabel = label ? String(label).substring(0, 50) : '';
  const now = Date.now();
  const updates = {};
  const added = [];
  const duplicates = [];
  const invalid = [];

  for (const t of tokens) {
    if (!EMAIL_RE.test(t) || t.length > 254) { invalid.push(t); continue; }
    if (existing.has(t)) { duplicates.push(t); continue; }
    existing.add(t); // email yang sama dua kali dalam satu input dihitung duplikat
    const id = uuidv4();
    updates[`emails/${id}`] = { email: t, label: cleanLabel, status: 'available', authorized: true, createdAt: now };
    added.push(t);
  }

  if (added.length) await db.ref('/').update(updates);

  const summary = { added: added.length, duplicates: duplicates.length, invalid: invalid.length };
  if (!added.length) {
    const msg = duplicates.length && !invalid.length ? 'Semua email sudah ada' : 'Tidak ada email valid yang bisa ditambahkan';
    return res.status(duplicates.length && !invalid.length ? 409 : 400).json({
      success: false, message: msg, data: { ...summary, invalidList: invalid.slice(0, 20) },
    });
  }
  return res.status(201).json({
    success: true,
    message: `${added.length} email ditambahkan`,
    data: { ...summary, invalidList: invalid.slice(0, 20), duplicateList: duplicates.slice(0, 20) },
  });
}

async function deleteEmail(req, res) {
  const { id } = req.params;
  const db = getDb();
  const snap = await db.ref(`emails/${id}`).once('value');
  if (!snap.exists()) return res.status(404).json({ success: false, message: 'Email tidak ditemukan' });
  if (snap.val().status === 'in_use') return res.status(409).json({ success: false, message: 'Email sedang digunakan' });
  await db.ref(`emails/${id}`).remove();
  return res.json({ success: true, message: 'Email dihapus' });
}

async function updateEmailStatus(req, res) {
  const { id } = req.params;
  const { authorized, status } = req.body;
  const db = getDb();
  const snap = await db.ref(`emails/${id}`).once('value');
  if (!snap.exists()) return res.status(404).json({ success: false, message: 'Email tidak ditemukan' });
  const updates = {};
  if (authorized !== undefined) updates.authorized = authorized;
  if (status && ['available', 'disabled'].includes(status)) {
    updates.status = status;
    updates.lockedBy = null;
    updates.lockedAt = null;
    updates.usedBy = null;
    updates.usedAt = null;
  }
  await db.ref(`emails/${id}`).update(updates);
  return res.json({ success: true, message: 'Status email diperbarui' });
}

// ─── ANNOUNCEMENT MANAGEMENT ─────────────────────────────────────────────────

async function getAnnouncements(req, res) {
  const db = getDb();
  const snap = await db.ref('announcements').once('value');
  const items = [];
  snap.forEach(child => {
    const v = child.val();
    items.push({ id: child.key, ...v, isActive: v.active !== false });
  });
  items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return res.json({ success: true, data: items });
}

async function createAnnouncement(req, res) {
  const { title, content, priority, active } = req.body;
  const actor = req.user;
  if (!title || !content) return res.status(400).json({ success: false, message: 'Title dan content wajib diisi' });
  const db = getDb();
  const id = uuidv4();
  await db.ref(`announcements/${id}`).set({
    title: title.trim(),
    content: content.trim(),
    priority: Number(priority) || 0,
    active: active !== false,
    createdAt: Date.now(),
    createdBy: actor.uid,
  });
  return res.status(201).json({ success: true, message: 'Pengumuman dibuat', data: { id } });
}

async function updateAnnouncement(req, res) {
  const { id } = req.params;
  const { title, content, priority, active } = req.body;
  const db = getDb();
  const snap = await db.ref(`announcements/${id}`).once('value');
  if (!snap.exists()) return res.status(404).json({ success: false, message: 'Pengumuman tidak ditemukan' });
  const updates = {};
  if (title) updates.title = title.trim();
  if (content) updates.content = content.trim();
  if (priority !== undefined) updates.priority = priority;
  if (active !== undefined) updates.active = active;
  await db.ref(`announcements/${id}`).update(updates);
  return res.json({ success: true, message: 'Pengumuman diperbarui' });
}

async function deleteAnnouncement(req, res) {
  const { id } = req.params;
  const db = getDb();
  await db.ref(`announcements/${id}`).remove();
  return res.json({ success: true, message: 'Pengumuman dihapus' });
}

// ─── SYSTEM MANAGEMENT ───────────────────────────────────────────────────────

async function getSystemSettings(req, res) {
  const db = getDb();
  const snap = await db.ref('system').once('value');
  const d = snap.val() || {};
  return res.json({
    success: true,
    data: {
      ...d,
      maintenance: d.maintenance === true,
      maintenanceMessage: d.maintenanceMessage || '',
      defaultDailyLimit: d.defaultDailyLimit ?? d.dailyLimit ?? 20,
      version: d.version || d.appVersion || '',
      welcomeMessage: d.welcomeMessage || '',
      apiStatus: d.apiStatus || 'unknown',
      backsoundEnabled: d.backsoundEnabled !== false,
      backsoundUrl: d.backsoundUrl || 'https://u.pone.rs/lgqzjhof.mp3',
      bgEnabled: d.bgEnabled === true,
      bgSource: d.bgSource === 'upload' ? 'upload' : 'url',
      bgUrl: d.bgUrl || '',
      bgBlur: Number.isFinite(Number(d.bgBlur)) ? Number(d.bgBlur) : 6,
      bgHasUpload: d.bgHasUpload === true,
      bgVersion: d.bgVersion || 0,
    },
  });
}

async function updateSystemSettings(req, res) {
  const actor = req.user;
  const { maintenance, maintenanceMessage, defaultDailyLimit, dailyLimit, version, welcomeMessage, apiStatus, backsoundEnabled, backsoundUrl, bgEnabled, bgSource, bgUrl, bgBlur } = req.body;
  const db = getDb();
  const updates = {};
  if (maintenance !== undefined) updates['system/maintenance'] = maintenance === true || maintenance === 'true';
  if (maintenanceMessage !== undefined) updates['system/maintenanceMessage'] = String(maintenanceMessage).substring(0, 300);
  const lim = defaultDailyLimit ?? dailyLimit;
  if (lim !== undefined && Number.isFinite(Number(lim)) && Number(lim) >= 0) {
    updates['system/defaultDailyLimit'] = Number(lim);
    updates['system/dailyLimit'] = Number(lim);
  }
  if (version !== undefined) {
    updates['system/version'] = String(version).substring(0, 30);
    updates['system/appVersion'] = String(version).substring(0, 30);
  }
  if (welcomeMessage !== undefined) updates['system/welcomeMessage'] = String(welcomeMessage).substring(0, 300);
  if (apiStatus !== undefined) updates['system/apiStatus'] = apiStatus;

  // Backsound: hanya owner
  if (actor.role === 'owner') {
    if (backsoundEnabled !== undefined) updates['system/backsoundEnabled'] = backsoundEnabled === true || backsoundEnabled === 'true';
    if (backsoundUrl !== undefined) {
      const url = String(backsoundUrl).trim();
      if (url === '') {
        updates['system/backsoundUrl'] = null; // kosong = kembali ke audio bawaan
      } else {
        if (url.length > 500 || !/^https?:\/\/[^\s]+$/i.test(url)) {
          return res.status(400).json({ success: false, message: 'URL backsound harus diawali http:// atau https:// dan tanpa spasi' });
        }
        updates['system/backsoundUrl'] = url;
      }
    }
  }

  // Background kustom: hanya owner
  if (actor.role === 'owner') {
    if (bgEnabled !== undefined) updates['system/bgEnabled'] = bgEnabled === true || bgEnabled === 'true';
    if (bgBlur !== undefined) {
      const b = Number(bgBlur);
      if (!Number.isFinite(b) || b < 0 || b > 24) {
        return res.status(400).json({ success: false, message: 'Blur background harus 0 sampai 24' });
      }
      updates['system/bgBlur'] = Math.round(b);
    }
    if (bgSource !== undefined) {
      if (bgSource !== 'url' && bgSource !== 'upload') {
        return res.status(400).json({ success: false, message: 'Sumber background tidak valid' });
      }
      updates['system/bgSource'] = bgSource;
      updates['system/bgVersion'] = Date.now();
    }
    if (bgUrl !== undefined) {
      const u = String(bgUrl).trim();
      if (u !== '' && (u.length > 1000 || !/^https?:\/\/[^\s"'()<>\\]+$/i.test(u))) {
        return res.status(400).json({ success: false, message: 'URL gambar harus diawali http:// atau https:// (tanpa spasi atau tanda kutip/kurung)' });
      }
      updates['system/bgUrl'] = u === '' ? null : u;
      updates['system/bgVersion'] = Date.now();
    }
  }
  if (Object.keys(updates).length === 0) return res.status(400).json({ success: false, message: 'Tidak ada setting yang diubah' });
  await db.ref('/').update(updates);
  clearDefaultLimitCache();
  await logAction({ actorUID: actor.uid, actorRole: actor.role, action: 'update_system', summary: `Updated: ${Object.keys(updates).join(', ')}` });
  return res.json({ success: true, message: 'Pengaturan sistem diperbarui' });
}

async function resetGlobalStats(req, res) {
  const actor = req.user;
  const db = getDb();
  await db.ref('system/stats').remove();
  const usersSnap = await db.ref('users').once('value');
  const updates = {};
  usersSnap.forEach(child => {
    updates[`users/${child.key}/totalUsage`] = 0;
    updates[`users/${child.key}/totalSuccess`] = 0;
    updates[`users/${child.key}/totalFailed`] = 0;
  });
  if (Object.keys(updates).length) await db.ref('/').update(updates);
  await logAction({ actorUID: actor.uid, actorRole: actor.role, action: 'reset_stats', summary: 'Global stats direset' });
  return res.json({ success: true, message: 'Statistik global direset' });
}

// Terapkan limit default ke SEMUA user yang sudah ada (kecuali owner)
async function applyDefaultLimit(req, res) {
  const actor = req.user;
  const db = getDb();
  const sysSnap = await db.ref('system/defaultDailyLimit').once('value');
  const lim = Number(sysSnap.val());
  if (!sysSnap.exists() || !Number.isFinite(lim) || lim < 0) {
    return res.status(400).json({ success: false, message: 'Limit default belum diatur' });
  }
  const usersSnap = await db.ref('users').once('value');
  const updates = {};
  let count = 0;
  usersSnap.forEach(child => {
    if (child.val().role === 'owner') return;
    updates[`users/${child.key}/dailyLimit`] = lim;
    count++;
  });
  if (count) await db.ref('/').update(updates);
  await logAction({ actorUID: actor.uid, actorRole: actor.role, action: 'apply_default_limit', summary: `Limit ${lim} diterapkan ke ${count} user` });
  return res.json({ success: true, message: `Limit ${lim} diterapkan ke ${count} user`, data: { limit: lim, count } });
}

async function resetAllLimits(req, res) {
  const actor = req.user;
  const db = getDb();
  const usersSnap = await db.ref('users').once('value');
  const updates = {};
  usersSnap.forEach(child => {
    updates[`users/${child.key}/usedToday`] = 0;
    updates[`users/${child.key}/lastResetDate`] = '';
  });
  if (Object.keys(updates).length) await db.ref('/').update(updates);
  await logAction({ actorUID: actor.uid, actorRole: actor.role, action: 'reset_limits', summary: 'Limit harian semua user direset' });
  return res.json({ success: true, message: 'Limit harian direset' });
}

async function getAdminStats(req, res) {
  const db = getDb();

  // Cek API eksternal paralel, tapi jangan sampai menahan dashboard admin lebih dari 5 detik
  let apiTimer;
  const apiCheck = Promise.race([
    checkApiStatus().catch(() => ({ online: false })),
    new Promise(resolve => { apiTimer = setTimeout(() => resolve({ online: false }), 5000); }),
  ]).finally(() => clearTimeout(apiTimer));

  const [usersSnap, statsSnap, sysSnap, codesSnap, emailsSnap, annSnap, apiStatus] = await Promise.all([
    db.ref('users').once('value'),
    db.ref('system/stats').once('value'),
    db.ref('system').once('value'),
    db.ref('redeem').once('value'),
    db.ref('emails').once('value'),
    db.ref('announcements').once('value'),
    apiCheck,
  ]);

  const today = getTodayJakarta();
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  let totalUsers = 0, totalActive = 0, totalSuspended = 0;
  const roles = { user: 0, premium: 0, moderator: 0, admin: 0, owner: 0 };
  let newToday = 0, newWeek = 0, activeToday = 0, usedTodayTotal = 0, limitTotalToday = 0;
  usersSnap.forEach(child => {
    const u = child.val();
    totalUsers++;
    if (u.status === 'suspended') totalSuspended++; else totalActive++;
    if (roles[u.role] !== undefined) roles[u.role]++; else roles.user++;
    if ((u.createdAt || 0) >= dayAgo) newToday++;
    if ((u.createdAt || 0) >= weekAgo) newWeek++;
    const used = u.lastResetDate === today ? (u.usedToday || 0) : 0;
    usedTodayTotal += used;
    limitTotalToday += (u.dailyLimit ?? 20);
    if (used > 0) activeToday++;
  });

  const emails = { available: 0, in_use: 0, disabled: 0 };
  emailsSnap.forEach(child => {
    const e = child.val();
    if (!e.authorized || (e.status && !['available', 'in_use', 'used'].includes(e.status))) emails.disabled++;
    else if (e.status === 'in_use' || e.status === 'used') emails.in_use++;
    else emails.available++;
  });

  let codesActive = 0, codesRedeemed = 0;
  codesSnap.forEach(child => {
    const c = child.val();
    if (c.active === true && (!c.expiresAt || c.expiresAt > Date.now()) && (!c.maxUses || (c.usedCount || 0) < c.maxUses)) codesActive++;
    codesRedeemed += c.usedCount || 0;
  });

  let announcementsActive = 0;
  annSnap.forEach(child => { if (child.val().active !== false) announcementsActive++; });

  const stats = statsSnap.val() || {};
  const sys = sysSnap.val() || {};
  const totalSuccess = stats.totalSuccess || 0;
  const totalFailed = stats.totalFailed || 0;
  const finished = totalSuccess + totalFailed;

  return res.json({
    success: true,
    data: {
      totalUsers,
      totalActive,
      totalSuspended,
      totalPremium: roles.premium,
      premiumUsers: roles.premium,
      roles,
      newUsersToday: newToday,
      newUsersWeek: newWeek,
      activeToday,
      usedToday: usedTodayTotal,
      limitToday: limitTotalToday,
      totalProcess: Math.max(stats.totalProcess || 0, finished),
      totalSuccess,
      totalFailed,
      successRate: finished > 0 ? Math.round((totalSuccess / finished) * 100) : 0,
      totalCodes: codesSnap.numChildren(),
      codesActive,
      codesRedeemed,
      totalEmails: emailsSnap.numChildren(),
      emails,
      totalAnnouncements: annSnap.numChildren(),
      announcementsActive,
      apiOnline: !!(apiStatus && apiStatus.online),
      apiLatency: (apiStatus && apiStatus.latency) || null,
      maintenance: sys.maintenance === true,
      defaultDailyLimit: sys.defaultDailyLimit ?? sys.dailyLimit ?? 20,
      version: sys.version || sys.appVersion || process.env.APP_VERSION || '',
    }
  });
}

async function getAdminLogs(req, res) {
  const db = getDb();
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 200);
  const snap = await db.ref('adminLogs').orderByChild('createdAt').limitToLast(limit).once('value');
  const logs = [];
  snap.forEach(child => {
    const v = child.val();
    logs.push({ id: child.key, ...v, timestamp: v.createdAt });
  });
  logs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return res.json({ success: true, data: logs });
}

// ─── Background kustom (upload dari galeri) ──────────────────
// Browser mengecilkan gambar dulu (maks 1600px, JPEG). Server tetap memeriksa isi file (magic bytes),
// jadi hanya JPEG/PNG/WebP asli yang diterima (SVG dan file lain ditolak).
const BG_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;
const BG_MAX_LEN = 1800000; // karakter base64 (~1,3MB gambar)

function sniffImageType(buf) {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length > 12 && buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return 'png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

async function uploadBackground(req, res) {
  const actor = req.user;
  const dataUrl = req.body && req.body.dataUrl;
  if (typeof dataUrl !== 'string' || dataUrl.length > BG_MAX_LEN || !BG_RE.test(dataUrl)) {
    return res.status(400).json({ success: false, message: 'Gambar tidak valid atau terlalu besar (pakai JPG/PNG/WebP, maks ~1,3MB)' });
  }
  const buf = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
  const type = sniffImageType(buf);
  if (!type) {
    return res.status(400).json({ success: false, message: 'Isi file bukan gambar JPG/PNG/WebP yang valid' });
  }
  const db = getDb();
  const version = Date.now();
  await db.ref('/').update({
    'backgroundAsset/data': dataUrl,
    'backgroundAsset/type': type,
    'system/bgSource': 'upload',
    'system/bgHasUpload': true,
    'system/bgVersion': version,
  });
  await logAction({ actorUID: actor.uid, actorRole: actor.role, action: 'upload_background', summary: `Upload background (${Math.round(buf.length / 1024)} KB)` });
  return res.json({ success: true, message: 'Background berhasil diupload', data: { version } });
}

async function deleteBackground(req, res) {
  const actor = req.user;
  const db = getDb();
  const snap = await db.ref('system/bgSource').once('value');
  const updates = {
    'backgroundAsset': null,
    'system/bgHasUpload': false,
    'system/bgVersion': Date.now(),
  };
  // Kalau yang aktif adalah gambar upload, otomatis kembali ke background default
  if (snap.val() === 'upload') {
    updates['system/bgEnabled'] = false;
    updates['system/bgSource'] = 'url';
  }
  await db.ref('/').update(updates);
  await logAction({ actorUID: actor.uid, actorRole: actor.role, action: 'delete_background', summary: 'Hapus background upload' });
  return res.json({ success: true, message: 'Background upload dihapus' });
}

module.exports = {
  uploadBackground, deleteBackground,
  getUsers, getUserDetail, updateUserRole, updateUserLimit, suspendUser, activateUser,
  createRedeemCode, getRedeemCodes, deleteRedeemCode, updateRedeemCode,
  getEmails, addEmail, deleteEmail, updateEmailStatus,
  getAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement,
  getSystemSettings, updateSystemSettings, getAdminStats, getAdminLogs,
  resetGlobalStats, resetAllLimits, applyDefaultLimit,
};
