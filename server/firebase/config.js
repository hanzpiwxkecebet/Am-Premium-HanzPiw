const admin = require('firebase-admin');
require('dotenv').config();

let db = null;
let isInitialized = false;

function initializeFirebase() {
  if (isInitialized) return db;

  try {
    if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
      console.warn('[Firebase] Environment variables not set. Using mock mode.');
      return null;
    }

    const serviceAccount = {
      type: 'service_account',
      project_id: process.env.FIREBASE_PROJECT_ID,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    };

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }

    db = admin.firestore();
    isInitialized = true;
    console.log('[Firebase] Initialized successfully');
    return db;
  } catch (error) {
    console.error('[Firebase] Initialization error:', error.message);
    return null;
  }
}

function getDb() {
  if (!isInitialized) return initializeFirebase();
  return db;
}

function getAdmin() {
  if (!isInitialized) initializeFirebase();
  return admin;
}

module.exports = { initializeFirebase, getDb, getAdmin };
