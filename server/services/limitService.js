const { getDb } = require('../config/firebase');
const { v4: uuidv4 } = require('uuid');

const DEFAULT_LIMIT = parseInt(process.env.DEFAULT_DAILY_LIMIT) || 20;

/**
 * Get today's date string in Asia/Jakarta timezone
 */
function getTodayJakarta() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }); // YYYY-MM-DD
}

/**
 * Check if user has remaining limit for today (atomic read)
 */
async function checkLimit(uid) {
  const today = getTodayJakarta();
  const db = getDb();
  const snap = await db.ref(`users/${uid}`).once('value');
  if (!snap.exists()) throw new Error('User tidak ditemukan');
  const data = snap.val();

  const dailyLimit = data.dailyLimit ?? DEFAULT_LIMIT;
  const usedToday = data.usedToday ?? 0;
  const lastResetDate = data.lastResetDate ?? '';

  // Reset if new day
  if (lastResetDate !== today) {
    return { remaining: dailyLimit, limit: dailyLimit, used: 0, needsReset: true };
  }

  const remaining = Math.max(0, dailyLimit - usedToday);
  return { remaining, limit: dailyLimit, used: usedToday, needsReset: false };
}

/**
 * Atomically consume one limit unit.
 * Returns the transaction result.
 */
async function consumeLimit(uid) {
  const today = getTodayJakarta();
  const db = getDb();
  const userRef = db.ref(`users/${uid}`);

  let consumed = false;
  let remaining = 0;

  await userRef.transaction(currentData => {
    if (!currentData) return currentData;

    const dailyLimit = currentData.dailyLimit ?? DEFAULT_LIMIT;
    const lastResetDate = currentData.lastResetDate ?? '';

    // Reset if new day
    if (lastResetDate !== today) {
      currentData.usedToday = 1;
      currentData.lastResetDate = today;
    } else {
      const usedToday = currentData.usedToday ?? 0;
      if (usedToday >= dailyLimit) {
        consumed = false;
        return currentData; // Abort (no change)
      }
      currentData.usedToday = usedToday + 1;
    }

    currentData.totalUsage = (currentData.totalUsage ?? 0) + 1;
    consumed = true;
    remaining = dailyLimit - (currentData.usedToday ?? 0);
    return currentData;
  });

  if (!consumed) {
    const snap = await userRef.once('value');
    const d = snap.val() || {};
    return { success: false, message: 'Limit harian habis', remaining: 0, limit: d.dailyLimit ?? DEFAULT_LIMIT };
  }

  return { success: true, remaining, message: 'Limit berhasil dikonsumsi' };
}

/**
 * Refund limit if generator process failed due to system error (not user action)
 */
async function refundLimit(uid) {
  const today = getTodayJakarta();
  const db = getDb();
  const userRef = db.ref(`users/${uid}`);

  await userRef.transaction(currentData => {
    if (!currentData) return currentData;
    if (currentData.lastResetDate !== today) return currentData; // already reset, no refund needed

    const usedToday = currentData.usedToday ?? 0;
    if (usedToday > 0) {
      currentData.usedToday = usedToday - 1;
    }
    currentData.totalUsage = Math.max(0, (currentData.totalUsage ?? 0) - 1);
    return currentData;
  });
}

/**
 * Record a usage event in history
 */
async function recordUsage(uid, { status, method, duration, requestId, notes }) {
  const db = getDb();
  const usageRef = db.ref(`usage/${uid}/${requestId || uuidv4()}`);
  await usageRef.set({
    status,
    method: method || 'custom',
    createdAt: Date.now(),
    completedAt: Date.now(),
    duration: duration || 0,
    notes: notes || '',
  });
}

/**
 * Update success/fail count
 */
async function updateStats(uid, success) {
  const db = getDb();
  const userRef = db.ref(`users/${uid}`);
  await userRef.transaction(currentData => {
    if (!currentData) return currentData;
    if (success) {
      currentData.totalSuccess = (currentData.totalSuccess ?? 0) + 1;
    } else {
      currentData.totalFailed = (currentData.totalFailed ?? 0) + 1;
    }
    return currentData;
  });
}

/**
 * Counter global (semua user) di system/stats/<field>. delta boleh negatif, hasil tidak pernah < 0.
 * Gagal menulis statistik tidak boleh menggagalkan proses utama.
 */
async function bumpGlobalStat(field, delta = 1) {
  try {
    await getDb().ref(`system/stats/${field}`).transaction(v => Math.max(0, (v || 0) + delta));
  } catch (e) {
    console.warn('[stats] gagal update', field, e.message);
  }
}

module.exports = { checkLimit, consumeLimit, refundLimit, recordUsage, updateStats, getTodayJakarta, bumpGlobalStat };
