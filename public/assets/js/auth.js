// Auth State Manager
const Auth = {
  user: null,
  userData: null,
  listeners: [],
  profilePromise: null,
  registering: false,
  _statePromise: null,

  /**
   * Inisialisasi auth. Tidak pernah menggantung: ada batas waktu di semua tahap.
   * options.waitProfile (default true): tunggu data profil dari backend (maks. ~8 detik).
   *   Isi false kalau halaman mau tampil dulu — gunakan Auth.profilePromise untuk menunggu profil.
   */
  async init(options = {}) {
    // waitProfile: true  = selalu tunggu profil backend
    //              false = tidak pernah menunggu (halaman mengatur sendiri lewat Auth.profilePromise)
    //              'auto' (default) = tunggu HANYA kalau profil belum pernah dimuat di perangkat ini
    //                (akun baru perlu dibuat dulu). Selain itu pakai profil cache dan segarkan di belakang layar.
    const waitProfile = options.waitProfile === undefined ? 'auto' : options.waitProfile;
    await AMApp.initFirebaseClient();
    const user = await this._waitForAuthState();
    this.user = user;

    if (user) {
      const cached = window.Cache ? window.Cache.get('profile:' + user.uid) : null;
      if (cached && !this.userData) this.userData = cached;
      this.profilePromise = this.loadUserData();
      if (waitProfile === true || (waitProfile === 'auto' && !cached)) await this.profilePromise;
    } else {
      this.userData = null;
      this.profilePromise = Promise.resolve(null);
    }
    return user;
  },

  _waitForAuthState(timeoutMs = 10000) {
    if (this._statePromise) return this._statePromise;
    this._statePromise = new Promise((resolve) => {
      let settled = false;
      const settle = (user) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(user);
      };
      const timer = setTimeout(() => settle(firebase.auth().currentUser || null), timeoutMs);

      firebase.auth().onAuthStateChanged(async (user) => {
        this.user = user;
        if (!settled) { settle(user); return; }
        // Perubahan state berikutnya (mis. logout dari tab lain)
        if (user) await this.loadUserData(); else this.userData = null;
        this.notifyListeners(user);
      }, (err) => {
        console.warn('[Auth] onAuthStateChanged error:', err && err.message);
        settle(firebase.auth().currentUser || null);
      });
    });
    return this._statePromise;
  },

  async loadUserData() {
    try {
      const res = await AMApp.apiCall('GET', '/api/auth/profile', null, {}, 8000);
      if (res.success) {
        this.userData = res.data;
        if (window.Cache && this.user) window.Cache.set('profile:' + this.user.uid, res.data);
      }
    } catch (e) {
      console.warn('[Auth] Could not load user data:', e.message);
    }
    return this.userData;
  },

  onAuthChange(callback) {
    this.listeners.push(callback);
  },

  notifyListeners(user) {
    for (const cb of this.listeners) {
      try { cb(user, this.userData); } catch (e) { /* abaikan error listener */ }
    }
  },

  async register(name, username, email, password) {
    this.registering = true; // cegah redirect otomatis sebelum profil tersimpan
    let createdUser = null;
    try {
      // Cek username dulu supaya tidak ada akun Firebase "yatim"
      try {
        const { res: chk, data: chkData } = await AMApp.requestJson(`/api/auth/username?username=${encodeURIComponent(username)}`, {}, 10000);
        if (chk.ok && chkData && chkData.success) throw new Error('Username sudah digunakan');
      } catch (e) {
        if (e.message === 'Username sudah digunakan') throw e;
        // error jaringan saat pre-check: lanjutkan, server tetap validasi lagi
      }

      const cred = await firebase.auth().createUserWithEmailAndPassword(email, password);
      createdUser = cred.user;
      await createdUser.updateProfile({ displayName: name });

      // Register profile to backend
      const token = await createdUser.getIdToken();
      const { res, data } = await AMApp.requestJson('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ uid: createdUser.uid, name, username, email }),
      }, 15000);
      if (!res.ok || !data || !data.success) {
        throw new Error((data && data.message) || 'Registrasi gagal');
      }
      return data;
    } catch (err) {
      // Rollback akun Firebase kalau profil gagal dibuat (best effort)
      if (createdUser) { try { await createdUser.delete(); } catch (e) { /* abaikan */ } }
      throw err;
    } finally {
      this.registering = false;
    }
  },

  async loginEmail(email, password) {
    return await firebase.auth().signInWithEmailAndPassword(email, password);
  },

  async loginUsername(username, password) {
    // Resolve email from username
    const { res, data } = await AMApp.requestJson(`/api/auth/username?username=${encodeURIComponent(username)}`, {}, 10000);
    if (!data || !data.success) {
      throw new Error((data && data.message) || (res.ok ? 'Username tidak ditemukan' : 'Server bermasalah, coba lagi'));
    }
    return await this.loginEmail(data.data.email, password);
  },

  async loginGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
      return await firebase.auth().signInWithPopup(provider);
    } catch (err) {
      // Popup diblokir browser (sering di HP) -> pakai redirect
      if (err && (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment')) {
        await firebase.auth().signInWithRedirect(provider);
        return null;
      }
      throw err;
    }
  },

  async logout() {
    await firebase.auth().signOut();
    if (window.Cache) window.Cache.clear();
    this.user = null;
    this.userData = null;
  },

  /** Ubah error Firebase jadi pesan Indonesia yang ramah */
  friendlyError(err) {
    const code = (err && err.code) || '';
    const map = {
      'auth/invalid-credential': 'Email/username atau password salah',
      'auth/wrong-password': 'Password salah',
      'auth/user-not-found': 'Akun tidak ditemukan',
      'auth/invalid-email': 'Format email tidak valid',
      'auth/user-disabled': 'Akun ini dinonaktifkan',
      'auth/too-many-requests': 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi',
      'auth/network-request-failed': 'Koneksi bermasalah. Periksa internet kamu',
      'auth/email-already-in-use': 'Email sudah digunakan akun lain',
      'auth/weak-password': 'Password terlalu lemah',
      'auth/popup-closed-by-user': '',
      'auth/cancelled-popup-request': '',
      'auth/unauthorized-domain': 'Domain ini belum diizinkan di Firebase Authentication',
    };
    if (code in map) return map[code];
    return (err && err.message) || 'Terjadi kesalahan';
  },

  redirectIfNotAuth(redirectTo = '/pages/login.html') {
    firebase.auth().onAuthStateChanged((user) => {
      if (!user) window.location.href = redirectTo;
    });
  },

  redirectIfAuth(redirectTo = '/pages/dashboard.html') {
    firebase.auth().onAuthStateChanged((user) => {
      if (user && !this.registering) window.location.href = redirectTo;
    });
  },

  getRoleBadgeClass(role) {
    const map = { owner: 'badge-owner', admin: 'badge-admin', moderator: 'badge-moderator', premium: 'badge-premium', user: 'badge-user' };
    return map[role] || 'badge-user';
  }
};

window.Auth = Auth;
