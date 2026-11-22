const admin = require('firebase-admin');
const axios = require('axios');

let db = null;
let auth = null;
let credential = null;
let lastUse = 0;

// Koneksi WebSocket Realtime Database "mati diam-diam" kalau instance serverless dibekukan
// Vercel di antara request. Tanpa penanganan, query berikutnya bisa menggantung sampai ~45 detik.
// Kalau instance sudah menganggur lebih dari ini, koneksi dibuat ulang sebelum dipakai.
const IDLE_RECONNECT_MS = 25 * 1000;

/** Hapus spasi/newline & tanda kutip pembungkus (sering ikut ter-paste di dashboard Vercel). */
function cleanEnv(raw) {
  if (raw === undefined || raw === null) return '';
  let v = String(raw).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

/**
 * Private key dari env sering datang dengan tanda kutip & "\n" literal
 * (terutama kalau di-paste ke dashboard Vercel). Rapikan di sini.
 */
function normalizePrivateKey(raw) {
  const key = cleanEnv(raw);
  if (!key) return undefined;
  return key.replace(/\\n/g, '\n');
}

const DB_URL_RE = /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.(firebaseio\.com|firebasedatabase\.app)$/i;

/**
 * Kalau FIREBASE_DATABASE_URL kosong, pakai URL default berdasarkan project ID.
 * (Untuk database di region selain US, WAJIB isi FIREBASE_DATABASE_URL manual,
 *  mis. https://NAMA-PROJECT-default-rtdb.asia-southeast1.firebasedatabase.app)
 */
function resolveDatabaseURL() {
  const fromEnv = cleanEnv(process.env.FIREBASE_DATABASE_URL).replace(/\/+$/, '');
  if (fromEnv) return fromEnv;
  const projectId = cleanEnv(process.env.FIREBASE_PROJECT_ID);
  if (projectId) return `https://${projectId}-default-rtdb.firebaseio.com`;
  return undefined;
}

function initFirebase() {
  if (admin.apps.length === 0) {
    const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);
    const projectId = cleanEnv(process.env.FIREBASE_PROJECT_ID);
    const clientEmail = cleanEnv(process.env.FIREBASE_CLIENT_EMAIL);

    if (!projectId || !privateKey || !clientEmail) {
      throw new Error('Firebase Admin SDK credentials are missing. Check your environment variables.');
    }

    const databaseURL = resolveDatabaseURL();
    // URL yang salah format bikin query menggantung tanpa error. Gagal cepat dengan pesan jelas.
    if (!databaseURL || !DB_URL_RE.test(databaseURL)) {
      throw new Error(
        'FIREBASE_DATABASE_URL tidak valid. Harus berbentuk https://NAMA-default-rtdb.firebaseio.com ' +
        'atau https://NAMA-default-rtdb.REGION.firebasedatabase.app (salin dari Firebase Console > Realtime Database).'
      );
    }

    credential = admin.credential.cert({ projectId, clientEmail, privateKey });
    admin.initializeApp({ credential, databaseURL });
    console.log('[Firebase] Admin SDK initialized');
  }

  db = admin.database();
  auth = admin.auth();
}

/** Paksa koneksi WebSocket dibuat ulang (query yang tertunda otomatis dikirim ulang). */
function resetConnection() {
  try {
    if (!db) return;
    db.goOffline();
    db.goOnline();
    console.warn('[Firebase] Koneksi database dibuat ulang');
  } catch (e) {
    console.error('[Firebase] resetConnection gagal:', e.message);
  }
}

function getDb() {
  if (!db) initFirebase();
  const now = Date.now();
  if (lastUse && now - lastUse > IDLE_RECONNECT_MS) resetConnection();
  lastUse = now;
  return db;
}

function getAuth() {
  if (!auth) initFirebase();
  return auth;
}

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message || `Timeout ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function errMsg(err) {
  return String(err && err.message ? err.message : err).slice(0, 300);
}

/**
 * Diagnosa koneksi database dalam 3 tahap, supaya jelas SALAH-nya di mana:
 *  1) credential : service account bisa menukar token? (private key / client email benar?)
 *  2) rest       : alamat database ada & token diterima? (URL / region / project benar?)
 *  3) websocket  : jalur yang dipakai Admin SDK (once('value')) merespons?
 * Tidak pernah mengembalikan nilai secret.
 */
async function diagnose() {
  const out = { credential: {}, rest: {}, websocket: {} };

  const envProject = cleanEnv(process.env.FIREBASE_PROJECT_ID);
  const email = cleanEnv(process.env.FIREBASE_CLIENT_EMAIL);
  const emailProject = (email.split('@')[1] || '').split('.')[0];
  out.credential.emailMatchesProject = !!envProject && emailProject === envProject;

  let url;
  try {
    getDb(); // pastikan sudah init (melempar error jelas kalau env salah)
    url = resolveDatabaseURL();
    out.host = url ? url.replace(/^https?:\/\//, '') : null;
  } catch (err) {
    out.credential.ok = false;
    out.credential.error = errMsg(err);
    return out;
  }

  // WebSocket (jalur Admin SDK) jalan paralel dengan credential -> REST
  const wsTask = (async () => {
    const t0 = Date.now();
    try {
      await withTimeout(db.ref('system/maintenance').once('value'), 6000, 'TIMEOUT 6 detik: koneksi WebSocket ke Realtime Database tidak terbentuk');
      out.websocket = { ok: true, ms: Date.now() - t0 };
    } catch (err) {
      out.websocket = { ok: false, ms: Date.now() - t0, error: errMsg(err) };
    }
  })();

  const restTask = (async () => {
    let token;
    const t0 = Date.now();
    try {
      const t = await withTimeout(credential.getAccessToken(), 5000, 'TIMEOUT 5 detik: gagal menukar token service account');
      token = t.access_token;
      out.credential = { ...out.credential, ok: true, ms: Date.now() - t0 };
    } catch (err) {
      out.credential = { ...out.credential, ok: false, ms: Date.now() - t0, error: errMsg(err) };
      return;
    }
    const t1 = Date.now();
    try {
      const r = await axios.get(`${url}/.json`, {
        params: { shallow: true, limitToFirst: 1, access_token: token },
        timeout: 5000,
        validateStatus: () => true,
      });
      const body = typeof r.data === 'string' ? r.data : JSON.stringify(r.data || '');
      out.rest = { ok: r.status === 200, status: r.status, ms: Date.now() - t1 };
      if (r.status !== 200) out.rest.error = body.slice(0, 200);
    } catch (err) {
      out.rest = { ok: false, ms: Date.now() - t1, error: errMsg(err) };
    }
  })();

  await Promise.all([wsTask, restTask]);
  return out;
}

module.exports = {
  initFirebase, getDb, getAuth, admin, resetConnection, withTimeout, diagnose,
  resolvedDatabaseURL: resolveDatabaseURL,
};
