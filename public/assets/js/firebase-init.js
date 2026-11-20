// Firebase Client Initialization
let firebaseApp = null;
let firebaseAuth = null;
let firebaseDb = null;

// Fallback config publik (aman di-expose di frontend)
const FIREBASE_FALLBACK_CONFIG = {
  apiKey: "AIzaSyC0NvbOa6C_ZbSG2EZnlDEV7KbhuCz6uCc",
  authDomain: "alight-motion-hanzpiw.firebaseapp.com",
  projectId: "alight-motion-hanzpiw",
  storageBucket: "alight-motion-hanzpiw.firebasestorage.app",
  messagingSenderId: "1020253139262",
  appId: "1:1020253139262:web:cfef138198dbbd7497bc6f"
};

async function initFirebaseClient() {
  if (firebaseApp) return { app: firebaseApp, auth: firebaseAuth, db: firebaseDb };

  let config = null;

  // Coba ambil config dari server
  try {
    const res = await fetch('/api/firebase-config');
    const json = await res.json();
    if (json.success && json.data) config = json.data;
  } catch (err) {
    console.warn('[Firebase] Gagal ambil config dari server, pakai fallback:', err.message);
  }

  // Fallback ke config hardcoded jika server gagal
  if (!config) {
    console.warn('[Firebase] Menggunakan fallback config');
    config = FIREBASE_FALLBACK_CONFIG;
  }

  try {
    firebaseApp = firebase.initializeApp(config);
    firebaseAuth = firebase.auth();
    firebaseDb = firebase.database ? firebase.database() : null;
    console.log('[Firebase] Client initialized');
    return { app: firebaseApp, auth: firebaseAuth, db: firebaseDb };
  } catch (err) {
    // Mungkin sudah diinisialisasi sebelumnya
    if (err.code === 'app/duplicate-app') {
      firebaseApp = firebase.app();
      firebaseAuth = firebase.auth();
      firebaseDb = firebase.database ? firebase.database() : null;
      return { app: firebaseApp, auth: firebaseAuth, db: firebaseDb };
    }
    console.error('[Firebase] Init error:', err.message);
    throw err;
  }
}

async function getIdToken() {
  const user = firebaseAuth?.currentUser;
  if (!user) throw new Error('Belum login');
  return await user.getIdToken(false);
}

async function apiCall(method, endpoint, body = null, extraHeaders = {}) {
  let token;
  try { token = await getIdToken(); } catch (e) { token = null; }

  const headers = {
    'Content-Type': 'application/json',
    'x-request-id': generateRequestId(),
    ...extraHeaders,
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const options = { method, headers };
  if (body && method !== 'GET') options.body = JSON.stringify(body);

  const res = await fetch(endpoint, options);
  const data = await res.json();

  if (!res.ok && !data.success) {
    throw new Error(data.message || `HTTP ${res.status}`);
  }
  return data;
}

function generateRequestId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

window.AMApp = { initFirebaseClient, getIdToken, apiCall };
