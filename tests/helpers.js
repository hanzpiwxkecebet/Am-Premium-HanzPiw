// Helper test: database Firebase palsu (di memori) + stub modul eksternal, supaya test jalan tanpa npm install
// dan tanpa koneksi. Transaksi meniru perilaku SDK asli: callback dipanggil pertama kali dengan null (cache kosong),
// lalu diulang dengan data asli kalau berbeda. Return undefined = batal.
const Module = require('module');
const path = require('path');

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const segs = (p) => String(p).split('/').filter(Boolean);

class Snap {
  constructor(key, val) { this.key = key; this._v = val === undefined ? null : val; }
  val() { return clone(this._v); }
  exists() { return this._v !== null && this._v !== undefined; }
  forEach(fn) { if (this._v && typeof this._v === 'object') for (const k of Object.keys(this._v)) fn(new Snap(k, this._v[k])); }
}

class FakeDb {
  constructor(initial = {}) { this.root = clone(initial); }
  _get(p) { let n = this.root; for (const s of segs(p)) { if (n == null || typeof n !== 'object') return null; n = n[s]; } return n === undefined ? null : n; }
  _set(p, v) {
    const parts = segs(p);
    if (!parts.length) { this.root = v === null ? {} : clone(v); return; }
    let n = this.root;
    for (let i = 0; i < parts.length - 1; i++) { if (n[parts[i]] == null || typeof n[parts[i]] !== 'object') n[parts[i]] = {}; n = n[parts[i]]; }
    if (v === null || v === undefined) {
      delete n[parts[parts.length - 1]];
      // RTDB asli menghapus node induk yang menjadi kosong
      for (let i = parts.length - 1; i > 0; i--) {
        const parent = this._get(parts.slice(0, i).join('/'));
        if (parent && typeof parent === 'object' && !Object.keys(parent).length) {
          const gp = this._get(parts.slice(0, i - 1).join('/')) || this.root;
          delete gp[parts[i - 1]];
        } else break;
      }
    } else n[parts[parts.length - 1]] = clone(v);
  }
  ref(p = '') {
    const db = this;
    return {
      key: segs(p).pop(),
      once: async () => new Snap(segs(p).pop(), db._get(p)),
      set: async (v) => db._set(p, v),
      remove: async () => db._set(p, null),
      update: async (obj) => { for (const [k, v] of Object.entries(obj)) db._set(p ? `${p}/${k}` : k, v); },
      transaction: async (cb) => {
        const actual = db._get(p);
        let res = cb(null);
        if (res === undefined) return { committed: false, snapshot: new Snap(segs(p).pop(), actual) };
        if (actual !== null) { // SDK asli: tebakan null != data server -> callback diulang dengan data asli
          res = cb(clone(actual));
          if (res === undefined) return { committed: false, snapshot: new Snap(segs(p).pop(), actual) };
        }
        db._set(p, res);
        return { committed: true, snapshot: new Snap(segs(p).pop(), res) };
      },
      push: () => {
        const key = Math.random().toString(16).slice(2, 12) + Date.now().toString(16).slice(-8);
        const childPath = p ? `${p}/${key}` : key;
        return { key, set: async (v) => db._set(childPath, v), once: async () => new Snap(key, db._get(childPath)) };
      },
      orderByChild: (child) => ({
        // Hanya cukup untuk test: urut naik berdasarkan field, ambil N terakhir
        limitToLast: (n) => ({ once: async () => {
          const base = db._get(p) || {};
          const out = {};
          Object.entries(base).sort((a, b) => (a[1][child] || 0) - (b[1][child] || 0)).slice(-n).forEach(([k, v]) => { out[k] = v; });
          return new Snap(segs(p).pop(), out);
        } }),
        startAt: (val) => ({ limitToLast: (n) => ({ once: async () => {
          const base = db._get(p) || {}; const out = {};
          Object.entries(base).filter(([, v]) => (v[child] || 0) >= val).sort((x, y) => (x[1][child] || 0) - (y[1][child] || 0)).slice(-n).forEach(([k, v]) => { out[k] = v; });
          return new Snap(segs(p).pop(), out);
        } }) }),
        equalTo: (val) => ({ once: async () => {
          const base = db._get(p) || {}; const out = {};
          for (const [k, v] of Object.entries(base)) if (v && v[child] === val) out[k] = v;
          return new Snap(segs(p).pop(), out);
        } }),
        endAt: (val) => ({ once: async () => {
          const base = db._get(p) || {}; const out = {};
          for (const [k, v] of Object.entries(base)) if (v && v[child] <= val) out[k] = v;
          return new Snap(segs(p).pop(), out);
        } }),
      }),
    };
  }
}

/** Pasang stub untuk modul eksternal & config/firebase. Panggil sekali di awal file test. */
function install({ db, axiosGet } = {}) {
  const state = { db: db || new FakeDb(), axiosCalls: [] };
  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'uuid') return { v4: () => 'uuid-' + Math.random().toString(36).slice(2, 10) };
    if (request === 'axios') {
      return {
        get: async (url, opts) => { state.axiosCalls.push({ url, opts }); return axiosGet ? axiosGet(url, opts) : { data: { success: true } }; },
        post: async () => ({ status: 200, data: {} }),
      };
    }
    if (request === 'firebase-admin') return { apps: [], credential: {}, initializeApp() {}, database: () => state.db, auth: () => ({}) };
    if (/config\/firebase$/.test(request)) {
      return {
        getDb: () => state.db, getAuth: () => ({}), initFirebase() {}, resetConnection() {},
        withTimeout: (p) => p, diagnose: async () => ({}), admin: {},
      };
    }
    return origLoad.apply(this, arguments);
  };
  return state;
}

/** Response palsu ala Express */
function mockRes() {
  const r = { statusCode: 200, body: null, headers: {} };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.set = (k, v) => { r.headers[k] = v; return r; };
  r.send = (b) => { r.body = b; return r; };
  r.end = () => r;
  return r;
}

module.exports = { FakeDb, install, mockRes, root: path.join(__dirname, '..') };
