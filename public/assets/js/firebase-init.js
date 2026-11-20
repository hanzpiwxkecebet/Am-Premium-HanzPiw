// Firebase Client Initialization
// Config is loaded dynamically from server to avoid hardcoding in HTML
let firebaseApp = null;
let firebaseAuth = null;
let firebaseDb = null;

async function initFirebaseClient() {
  if (firebaseApp) return { app: firebaseApp, auth: firebaseAuth, db: firebaseDb };

  try {
    const res = await fetch('/api/firebase-config');
    const json = await res.json();
    if (!json.success) throw new Error(json.message || 'Config not available');

    const config = json.data;

    // Import Firebase modules (CDN globals assumed loaded via HTML)
    firebaseApp = firebase.initializeApp(config);
    firebaseAuth = firebase.auth();
    firebaseDb = firebase.database();

    console.log('[Firebase] Client initialized');
    return { app: firebaseApp, auth: firebaseAuth, db: firebaseDb };
  } catch (err) {
    console.error('[Firebase] Init failed:', err.message);
    throw err;
  }
}

async function getIdToken() {
  const user = firebaseAuth?.currentUser;
  if (!user) throw new Error('Belum login');
  return await user.getIdToken(/* forceRefresh */ false);
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

// Export globally
window.AMApp = { initFirebaseClient, getIdToken, apiCall };
