// Rate limit yang berlaku lintas instance serverless (disimpan di Firebase RTDB: rateLimits/{key}).
// express-rate-limit memakai memori per instance, jadi di Vercel tiap instance punya hitungan sendiri.
// Dipakai untuk endpoint sensitif: generate, redeem, login username. Kalau database bermasalah: lolos (fail-open),
// supaya pengguna sah tidak terkunci hanya karena rate limiter error.
const crypto = require('crypto');
const { getDb } = require('../config/firebase');

function hashKey(s) {
  return crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 24);
}

/**
 * @param {object} o
 * @param {string} o.name      nama bucket (mis. 'gen-send')
 * @param {number} o.windowMs  panjang jendela
 * @param {number} o.max       maksimal request per jendela
 * @param {(req)=>string} o.key  pembeda (uid / ip / ip+username)
 * @param {string} o.message
 */
function dbRateLimit({ name, windowMs, max, key, message }) {
  return async function limiter(req, res, next) {
    let id;
    try { id = hashKey(key(req)); } catch (e) { return next(); }
    const ref = getDb().ref(`rateLimits/${name}_${id}`);
    const now = Date.now();
    let allowed = true;
    let retryAfter = 0;
    try {
      await ref.transaction((cur) => {
        if (!cur || !cur.resetAt || cur.resetAt <= now) {
          allowed = true;
          return { count: 1, resetAt: now + windowMs };
        }
        if (cur.count >= max) {
          allowed = false;
          retryAfter = Math.ceil((cur.resetAt - now) / 1000);
          return; // batalkan, tidak menambah hitungan
        }
        allowed = true;
        cur.count += 1;
        return cur;
      });
    } catch (e) {
      console.warn('[RateLimit] DB error, lolos:', e.message);
      return next();
    }
    if (!allowed) {
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ success: false, message: message || 'Terlalu banyak request. Coba lagi nanti.' });
    }
    next();
  };
}

/** Hapus bucket yang sudah lewat (dipanggil dari cron). */
async function purgeRateLimits(db, now = Date.now()) {
  const snap = await db.ref('rateLimits').orderByChild('resetAt').endAt(now).once('value');
  const updates = {};
  let n = 0;
  snap.forEach((c) => { updates[`rateLimits/${c.key}`] = null; n++; });
  if (n) await db.ref('/').update(updates);
  return n;
}

module.exports = { dbRateLimit, purgeRateLimits, hashKey };
