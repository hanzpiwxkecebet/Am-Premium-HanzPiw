// Auth State Manager
const Auth = {
  user: null,
  userData: null,
  listeners: [],

  async init() {
    await AMApp.initFirebaseClient();

    return new Promise((resolve) => {
      firebase.auth().onAuthStateChanged(async (user) => {
        this.user = user;
        if (user) {
          await this.loadUserData();
        } else {
          this.userData = null;
        }
        this.notifyListeners(user);
        resolve(user);
      });
    });
  },

  async loadUserData() {
    try {
      const res = await AMApp.apiCall('GET', '/api/auth/profile');
      if (res.success) this.userData = res.data;
    } catch (e) {
      console.warn('[Auth] Could not load user data:', e.message);
    }
  },

  onAuthChange(callback) {
    this.listeners.push(callback);
  },

  notifyListeners(user) {
    for (const cb of this.listeners) {
      try { cb(user, this.userData); } catch (e) {}
    }
  },

  async register(name, username, email, password) {
    const cred = await firebase.auth().createUserWithEmailAndPassword(email, password);
    const user = cred.user;
    await user.updateProfile({ displayName: name });

    // Register profile to backend
    const token = await user.getIdToken();
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ uid: user.uid, name, username, email }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Registrasi gagal');
    return data;
  },

  async loginEmail(email, password) {
    return await firebase.auth().signInWithEmailAndPassword(email, password);
  },

  async loginUsername(username, password) {
    // Resolve email from username
    const res = await fetch(`/api/auth/username?username=${encodeURIComponent(username)}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Username tidak ditemukan');
    return await this.loginEmail(data.data.email, password);
  },

  async loginGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    // Gunakan redirect (lebih stabil di mobile browser vs popup)
    await firebase.auth().signInWithRedirect(provider);
    // Fungsi ini tidak return — browser akan redirect ke Google lalu balik ke app
  },

  // Dipanggil saat halaman load untuk menangkap hasil redirect Google login
  async handleGoogleRedirect() {
    try {
      const result = await firebase.auth().getRedirectResult();
      if (!result || !result.user) return null;

      const user = result.user;
      const token = await user.getIdToken();
      const profileRes = await fetch('/api/auth/profile', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (profileRes.status === 404) {
        // Auto-create profile untuk Google user baru
        const username = (user.email.split('@')[0] + Math.floor(Math.random() * 999))
          .toLowerCase().replace(/[^a-z0-9_]/g, '').substring(0, 20);
        await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ uid: user.uid, name: user.displayName || user.email, username, email: user.email }),
        });
      }
      return result;
    } catch (e) {
      console.error('[Auth] Google redirect error:', e);
      throw e;
    }
  },

  async logout() {
    await firebase.auth().signOut();
    this.user = null;
    this.userData = null;
  },

  redirectIfNotAuth(redirectTo = '/pages/login.html') {
    firebase.auth().onAuthStateChanged((user) => {
      if (!user) window.location.href = redirectTo;
    });
  },

  redirectIfAuth(redirectTo = '/pages/dashboard.html') {
    firebase.auth().onAuthStateChanged((user) => {
      if (user) window.location.href = redirectTo;
    });
  },

  getRoleBadgeClass(role) {
    const map = { owner: 'badge-owner', admin: 'badge-admin', moderator: 'badge-moderator', premium: 'badge-premium', user: 'badge-user' };
    return map[role] || 'badge-user';
  }
};

window.Auth = Auth;
