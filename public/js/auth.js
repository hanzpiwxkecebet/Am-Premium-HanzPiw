/* ============================================================
   AM Premium Free - Auth JS (User Login/Register)
   ============================================================ */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyC0NvbOa6C_ZbSG2EZnlDEV7KbhuCz6uCc",
  authDomain: "alight-motion-hanzpiw.firebaseapp.com",
  projectId: "alight-motion-hanzpiw",
  storageBucket: "alight-motion-hanzpiw.firebasestorage.app",
  messagingSenderId: "1020253139262",
  appId: "1:1020253139262:web:cfef138198dbbd7497bc6f"
};

// Init Firebase if available
function initFirebase() {
  try {
    if (typeof firebase !== 'undefined' && !firebase.apps.length) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }
    return true;
  } catch (e) { console.warn('[Auth] Firebase init:', e.message); return false; }
}

const Auth = {
  async getToken() {
    try {
      const user = firebase.auth().currentUser;
      if (!user) return null;
      return await user.getIdToken();
    } catch { return null; }
  },

  async getUser() {
    return new Promise(resolve => {
      firebase.auth().onAuthStateChanged(user => resolve(user), () => resolve(null));
    });
  },

  async login(email, password) {
    const cred = await firebase.auth().signInWithEmailAndPassword(email, password);
    const token = await cred.user.getIdToken();
    sessionStorage.setItem('amp_uid', cred.user.uid);
    sessionStorage.setItem('amp_email', cred.user.email);
    sessionStorage.setItem('amp_token', token);
    return cred.user;
  },

  async register(email, password) {
    const cred = await firebase.auth().createUserWithEmailAndPassword(email, password);
    const token = await cred.user.getIdToken();
    sessionStorage.setItem('amp_uid', cred.user.uid);
    sessionStorage.setItem('amp_email', cred.user.email);
    sessionStorage.setItem('amp_token', token);
    return cred.user;
  },

  async logout() {
    await firebase.auth().signOut();
    sessionStorage.removeItem('amp_uid');
    sessionStorage.removeItem('amp_email');
    sessionStorage.removeItem('amp_token');
    window.location.href = '/login';
  },

  isLoggedIn() {
    return !!sessionStorage.getItem('amp_uid');
  },

  requireAuth() {
    if (!this.isLoggedIn()) {
      window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname);
    }
  },

  // Refresh token periodically
  async refreshToken() {
    try {
      const user = firebase.auth().currentUser;
      if (user) {
        const token = await user.getIdToken(true);
        sessionStorage.setItem('amp_token', token);
        return token;
      }
    } catch {}
    return sessionStorage.getItem('amp_token');
  }
};

// Init on load
document.addEventListener('DOMContentLoaded', () => {
  initFirebase();

  // Listen to auth state
  if (typeof firebase !== 'undefined') {
    firebase.auth().onAuthStateChanged(async user => {
      if (user) {
        const token = await user.getIdToken();
        sessionStorage.setItem('amp_uid', user.uid);
        sessionStorage.setItem('amp_email', user.email);
        sessionStorage.setItem('amp_token', token);
        updateNavUser(user.email);
      } else {
        sessionStorage.removeItem('amp_uid');
        sessionStorage.removeItem('amp_email');
        sessionStorage.removeItem('amp_token');
        updateNavUser(null);
      }
    });
  }
});

function updateNavUser(email) {
  const loginBtn  = document.getElementById('navLoginBtn');
  const logoutBtn = document.getElementById('navLogoutBtn');
  const userInfo  = document.getElementById('navUserInfo');
  if (email) {
    if (loginBtn)  loginBtn.style.display  = 'none';
    if (logoutBtn) logoutBtn.style.display = 'inline-flex';
    if (userInfo)  { userInfo.style.display = 'flex'; userInfo.textContent = '👤 ' + email.split('@')[0]; }
  } else {
    if (loginBtn)  loginBtn.style.display  = 'inline-flex';
    if (logoutBtn) logoutBtn.style.display = 'none';
    if (userInfo)  userInfo.style.display  = 'none';
  }
}

window.Auth = Auth;
