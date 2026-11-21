const admin = require('firebase-admin');

let db = null;
let auth = null;

/**
 * Private key dari env sering datang dengan tanda kutip & "\n" literal
 * (terutama kalau di-paste ke dashboard Vercel). Rapikan di sini.
 */
function normalizePrivateKey(raw) {
  if (!raw) return undefined;
  let key = String(raw).trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }
  return key.replace(/\\n/g, '\n');
}

/**
 * Kalau FIREBASE_DATABASE_URL kosong, pakai URL default berdasarkan project ID.
 * (Untuk database di region selain US, WAJIB isi FIREBASE_DATABASE_URL manual,
 *  mis. https://NAMA-PROJECT-default-rtdb.asia-southeast1.firebasedatabase.app)
 */
function resolveDatabaseURL() {
  if (process.env.FIREBASE_DATABASE_URL) return process.env.FIREBASE_DATABASE_URL.trim();
  if (process.env.FIREBASE_PROJECT_ID) {
    return `https://${process.env.FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com`;
  }
  return undefined;
}

function initFirebase() {
  if (admin.apps.length === 0) {
    const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);

    if (!process.env.FIREBASE_PROJECT_ID || !privateKey || !process.env.FIREBASE_CLIENT_EMAIL) {
      throw new Error('Firebase Admin SDK credentials are missing. Check your environment variables.');
    }

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey,
      }),
      databaseURL: resolveDatabaseURL(),
    });
    console.log('[Firebase] Admin SDK initialized');
  }

  db = admin.database();
  auth = admin.auth();
}

function getDb() {
  if (!db) initFirebase();
  return db;
}

function getAuth() {
  if (!auth) initFirebase();
  return auth;
}

module.exports = { initFirebase, getDb, getAuth, admin };
