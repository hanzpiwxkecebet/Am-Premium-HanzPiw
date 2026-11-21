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
  const method = String((options && options.method) || 'GET').toUpperCase();
  // Satu kali retry otomatis untuk GET (cold start / jaringan HP yang goyang). POST tidak pernah diulang.
  const maxAttempts = method === 'GET' ? 2 : 1;
  if (window.Progress) window.Progress.start();
  try {
    let lastErr = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        // 502/503/504 = function belum siap: coba sekali lagi
        if (attempt < maxAttempts && (res.status === 502 || res.status === 503 || res.status === 504)) {
          await new Promise((r) => setTimeout(r, 400));
          continue;
        }
        const text = await res.text();
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
        return { res, data };
      } catch (err) {
        lastErr = err && err.name === 'AbortError'
          ? new Error('Server terlalu lama merespons. Coba lagi.')
          : err;
        if (attempt >= maxAttempts) throw lastErr;
        await new Promise((r) => setTimeout(r, 400));
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastErr || new Error('Permintaan gagal');
  } finally {
    if (window.Progress) window.Progress.done();
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

  // JANGAN menunggu server: pakai config cache / fallback SEKETIKA (config ini publik).
  // Request ke server tetap dilakukan di belakang layar untuk memperbarui cache.
  let config = null;
  try {
    const cached = JSON.parse(localStorage.getItem('am:fbconfig') || 'null');
    if (cached && cached.apiKey && cached.projectId) config = cached;
  } catch (e) { /* abaikan */ }
  if (!config) config = FIREBASE_FALLBACK_CONFIG;

  refreshFirebaseConfig();

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

function refreshFirebaseConfig() {
  requestJson('/api/firebase-config', {}, CONFIG_TIMEOUT_MS * 3)
    .then(({ res, data }) => {
      if (res.ok && data && data.success && data.data && data.data.apiKey && data.data.projectId) {
        try { localStorage.setItem('am:fbconfig', JSON.stringify(data.data)); } catch (e) { /* abaikan */ }
      }
    })
    .catch(() => { /* tidak kritis */ });
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
