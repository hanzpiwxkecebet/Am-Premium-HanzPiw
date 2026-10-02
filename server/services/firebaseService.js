const { getDb, getAdmin } = require('../firebase/config');
const { v4: uuidv4 } = require('uuid');

// In-memory fallback when Firebase is not configured
const memStore = {
  stats: { total: 0, success: 0, failed: 0, today: 0 },
  generations: [],
  settings: { maintenance: false, cooldown: 30, announcement: null },
  cooldowns: {}
};

function getTs() {
  return getAdmin()?.firestore?.Timestamp?.now() || new Date().toISOString();
}

// ─── Stats ─────────────────────────────────────────────────────────────────

async function getStats() {
  const db = getDb();
  if (!db) return memStore.stats;
  try {
    const doc = await db.collection('stats').doc('global').get();
    if (!doc.exists) return { total: 0, success: 0, failed: 0, today: 0 };
    return doc.data();
  } catch (e) {
    console.error('[FB] getStats error:', e.message);
    return memStore.stats;
  }
}

async function incrementStat(type) {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  if (!db) {
    if (type === 'success' || type === 'failed') memStore.stats.total = (memStore.stats.total || 0) + 1;
    if (type === 'success') memStore.stats.success = (memStore.stats.success || 0) + 1;
    if (type === 'failed') memStore.stats.failed = (memStore.stats.failed || 0) + 1;
    return;
  }
  try {
    const ref = db.collection('stats').doc('global');
    const FieldValue = getAdmin().firestore.FieldValue;
    const update = {};
    if (type === 'success' || type === 'failed') update.total = FieldValue.increment(1);
    if (type === 'success') update.success = FieldValue.increment(1);
    if (type === 'failed') update.failed = FieldValue.increment(1);
    update[`daily.${today}`] = FieldValue.increment(1);
    await ref.set(update, { merge: true });
  } catch (e) {
    console.error('[FB] incrementStat error:', e.message);
  }
}

// ─── Generations ───────────────────────────────────────────────────────────

async function saveGeneration({ email, status, requestId, ip, uid }) {
  const db = getDb();
  const id = uuidv4();
  const masked = maskEmail(email);
  const entry = {
    id,
    maskedEmail: masked,
    status,
    requestId: requestId || id,
    timestamp: new Date().toISOString(),
    ip: ip ? hashIp(ip) : 'unknown',
    uid: uid || null
  };
  if (!db) {
    memStore.generations.unshift(entry);
    if (memStore.generations.length > 100) memStore.generations.pop();
    return id;
  }
  try {
    await db.collection('generations').doc(id).set(entry);
    return id;
  } catch (e) {
    console.error('[FB] saveGeneration error:', e.message);
    return id;
  }
}

async function getGenerations(limit = 50) {
  const db = getDb();
  if (!db) return memStore.generations.slice(0, limit);
  try {
    const snap = await db.collection('generations')
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map(d => d.data());
  } catch (e) {
    console.error('[FB] getGenerations error:', e.message);
    return [];
  }
}

// ─── Settings ──────────────────────────────────────────────────────────────

async function getSettings() {
  const db = getDb();
  if (!db) return memStore.settings;
  try {
    const doc = await db.collection('settings').doc('global').get();
    if (!doc.exists) return memStore.settings;
    return doc.data();
  } catch (e) {
    console.error('[FB] getSettings error:', e.message);
    return memStore.settings;
  }
}

async function updateSettings(data) {
  const db = getDb();
  if (!db) {
    Object.assign(memStore.settings, data);
    return;
  }
  try {
    await db.collection('settings').doc('global').set(data, { merge: true });
  } catch (e) {
    console.error('[FB] updateSettings error:', e.message);
  }
}

// ─── Cooldown ──────────────────────────────────────────────────────────────

async function checkCooldown(ip) {
  const db = getDb();
  const key = `cd_${hashIp(ip)}`;
  const cooldownSeconds = parseInt(process.env.COOLDOWN_SECONDS || '30');
  const now = Date.now();

  if (!db) {
    const last = memStore.cooldowns[ip];
    if (last && (now - last) < cooldownSeconds * 1000) {
      return Math.ceil((cooldownSeconds * 1000 - (now - last)) / 1000);
    }
    memStore.cooldowns[ip] = now;
    return 0;
  }

  try {
    const doc = await db.collection('cooldowns').doc(key).get();
    if (doc.exists) {
      const data = doc.data();
      const elapsed = now - data.timestamp;
      if (elapsed < cooldownSeconds * 1000) {
        return Math.ceil((cooldownSeconds * 1000 - elapsed) / 1000);
      }
    }
    await db.collection('cooldowns').doc(key).set({ timestamp: now });
    return 0;
  } catch (e) {
    console.error('[FB] checkCooldown error:', e.message);
    return 0;
  }
}

// ─── Announcements ─────────────────────────────────────────────────────────

async function getAnnouncements() {
  const db = getDb();
  if (!db) return memStore.settings.announcement ? [memStore.settings.announcement] : [];
  try {
    const snap = await db.collection('announcements')
      .where('active', '==', true)
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    return [];
  }
}

async function createAnnouncement(data) {
  const db = getDb();
  const entry = { ...data, active: true, createdAt: new Date().toISOString() };
  if (!db) {
    memStore.settings.announcement = entry;
    return;
  }
  try {
    await db.collection('announcements').add(entry);
  } catch (e) {
    console.error('[FB] createAnnouncement error:', e.message);
  }
}

// ─── Logs ──────────────────────────────────────────────────────────────────

async function writeLog(level, message, data = {}) {
  const db = getDb();
  const entry = { level, message, data, timestamp: new Date().toISOString() };
  if (!db) return;
  try {
    await db.collection('logs').add(entry);
  } catch (e) { /* silent */ }
}

async function getLogs(limit = 100) {
  const db = getDb();
  if (!db) return [];
  try {
    const snap = await db.collection('logs')
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    return [];
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function maskEmail(email) {
  if (!email || !email.includes('@')) return '****';
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
}

function hashIp(ip) {
  if (!ip) return 'unknown';
  const parts = ip.split('.');
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.*.*`;
  return ip.slice(0, 8) + '***';
}

// ─── Admin: Verify token ───────────────────────────────────────────────────

async function verifyAdminToken(token) {
  const admin = getAdmin();
  if (!admin || !admin.apps.length) {
    // Fallback: check against env secret
    return token === process.env.ADMIN_SECRET;
  }
  try {
    await admin.auth().verifyIdToken(token);
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = {
  getStats, incrementStat,
  saveGeneration, getGenerations,
  getSettings, updateSettings,
  checkCooldown,
  getAnnouncements, createAnnouncement,
  writeLog, getLogs,
  verifyAdminToken,
  maskEmail
};

// ─── User Daily Limit ──────────────────────────────────────────────────────

async function checkAndIncrementUserLimit(uid) {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const LIMIT = parseInt(process.env.DAILY_LIMIT || '10');

  if (!db) return { allowed: true, remaining: LIMIT, used: 0 };

  try {
    const ref = db.collection('users').doc(uid);
    const doc = await ref.get();

    if (!doc.exists) {
      await ref.set({ dailyCount: 1, lastDate: today, createdAt: new Date().toISOString() }, { merge: true });
      return { allowed: true, remaining: LIMIT - 1, used: 1 };
    }

    const data = doc.data();

    if (data.lastDate !== today) {
      await ref.update({ dailyCount: 1, lastDate: today });
      return { allowed: true, remaining: LIMIT - 1, used: 1 };
    }

    const used = data.dailyCount || 0;
    if (used >= LIMIT) return { allowed: false, remaining: 0, used };

    await ref.update({ dailyCount: getAdmin().firestore.FieldValue.increment(1) });
    return { allowed: true, remaining: LIMIT - (used + 1), used: used + 1 };
  } catch (e) {
    console.error('[FB] checkLimit error:', e.message);
    return { allowed: true, remaining: LIMIT, used: 0 };
  }
}

async function getUserStats(uid) {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const LIMIT = parseInt(process.env.DAILY_LIMIT || '10');
  if (!db) return { used: 0, remaining: LIMIT, limit: LIMIT };
  try {
    const doc = await db.collection('users').doc(uid).get();
    if (!doc.exists) return { used: 0, remaining: LIMIT, limit: LIMIT };
    const d = doc.data();
    const used = d.lastDate === today ? (d.dailyCount || 0) : 0;
    return { used, remaining: LIMIT - used, limit: LIMIT };
  } catch { return { used: 0, remaining: LIMIT, limit: LIMIT }; }
}

module.exports = Object.assign(module.exports, { checkAndIncrementUserLimit, getUserStats });
