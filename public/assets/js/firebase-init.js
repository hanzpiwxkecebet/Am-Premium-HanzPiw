// Firebase Client Initialization
let firebaseApp = null;
let firebaseAuth = null;
let firebaseInitPromise = null;

// Fallback config publik (aman di-expose di frontend)
const FIREBASE_FALLBACK_CONFIG = {
  apiKey: "AIzaSyC0NvbOa6C_ZbSG2EZnlDEV7KbhuCz6uCc",
  authDomain: "alight-motion-hanzpiw.firebaseapp.com",
  projectId: "alight-motion-hanzpiw",
  storageBucket: "alight-motion-hanzpiw.firebasestorage.app",
  messagingSenderId: "1020253139262",
  appId: "1:1020253139262:web:cfef138198dbbd7497bc6f"
};

const CONFIG_TIMEOUT_MS = 3000;   // ambil config dari server
const API_TIMEOUT_MS = 15000;     // request API biasa

/**
 * fetch + parse JSON dengan timeout, supaya halaman TIDAK pernah menggantung
 * selamanya kalau server lambat / tidak merespons.
 * Mengembalikan { res, data } — data = null kalau respons bukan JSON.
 */
async function requestJson(url, options = {}, timeoutMs = API_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
    return { res, data };
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new Error('Server terlalu lama merespons. Coba lagi.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function initFirebaseClient() {
  // Satu promise untuk semua pemanggil (tidak ada init ganda / race)
  if (!firebaseInitPromise) {
    firebaseInitPromise = doInitFirebaseClient().catch((err) => {
      firebaseInitPromise = null; // boleh dicoba lagi
      throw err;
    });
  }
  return firebaseInitPromise;
}

async function doInitFirebaseClient() {
  if (typeof firebase === 'undefined') {
    throw new Error('Firebase SDK gagal dimuat. Periksa koneksi internet lalu refresh halaman.');
  }

  let config = null;

  // Coba ambil config dari server (dengan timeout)
  try {
    const { res, data } = await requestJson('/api/firebase-config', {}, CONFIG_TIMEOUT_MS);
    if (res.ok && data && data.success && data.data && data.data.apiKey && data.data.projectId) {
      config = data.data;
    }
  } catch (err) {
    console.warn('[Firebase] Gagal ambil config dari server, pakai fallback:', err.message);
  }

  // Fallback ke config hardcoded jika server gagal
  if (!config) {
    console.warn('[Firebase] Menggunakan fallback config');
    config = FIREBASE_FALLBACK_CONFIG;
  }

  try {
    firebaseApp = firebase.apps && firebase.apps.length ? firebase.app() : firebase.initializeApp(config);
  } catch (err) {
    if (err.code === 'app/duplicate-app') {
      firebaseApp = firebase.app();
    } else {
      console.error('[Firebase] Init error:', err.message);
      throw err;
    }
  }

  try {
    firebaseAuth = firebase.auth();
  } catch (err) {
    console.error('[Firebase] Auth init error:', err.message);
    throw err;
  }

  console.log('[Firebase] Client initialized');
  return { app: firebaseApp, auth: firebaseAuth, db: null };
}

async function getIdToken() {
  const user = firebaseAuth && firebaseAuth.currentUser;
  if (!user) throw new Error('Belum login');
  return await user.getIdToken(false);
}

async function apiCall(method, endpoint, body = null, extraHeaders = {}, timeoutMs = API_TIMEOUT_MS) {
  let token = null;
  try { token = await getIdToken(); } catch (e) { token = null; }

  const headers = {
    'Content-Type': 'application/json',
    'x-request-id': generateRequestId(),
    ...extraHeaders,
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const options = { method, headers };
  if (body && method !== 'GET') options.body = JSON.stringify(body);

  const { res, data } = await requestJson(endpoint, options, timeoutMs);

  if (!data) {
    throw new Error(res.ok ? 'Respons server tidak valid' : `Server bermasalah (HTTP ${res.status})`);
  }
  if (!res.ok || data.success === false) {
    throw new Error(data.message || `HTTP ${res.status}`);
  }
  return data;
}

function generateRequestId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

window.AMApp = { initFirebaseClient, getIdToken, apiCall, requestJson };
