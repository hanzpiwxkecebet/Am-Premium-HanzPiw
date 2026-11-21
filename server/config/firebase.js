const admin = require('firebase-admin');

let db = null;
let auth = null;

function initFirebase() {
  if (admin.apps.length > 0) {
    db = admin.database();
    auth = admin.auth();
    return;
  }

  const privateKey = process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    : undefined;

  if (!process.env.FIREBASE_PROJECT_ID || !privateKey || !process.env.FIREBASE_CLIENT_EMAIL) {
    throw new Error('Firebase Admin SDK credentials are missing. Check your .env file.');
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });

  db = admin.database();
  auth = admin.auth();
  console.log('[Firebase] Admin SDK initialized');
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
