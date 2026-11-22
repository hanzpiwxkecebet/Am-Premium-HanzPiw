# Security Guide — AM Premium Generator V2.0

## Arsitektur Keamanan

```
Browser (Client)
    │
    │  HTTPS only
    ▼
Vercel Edge / Nginx
    │
    │  Helmet headers, CORS, Rate Limit
    ▼
Express Server (Backend)
    │
    │  Firebase Admin SDK (service account)
    ▼
Firebase (Auth + RTDB)
```

---

## Prinsip Utama

### 1. Never Trust the Client
- Role, limit, dan status user **selalu divalidasi server-side**
- `localStorage` hanya untuk UI convenience (tema, preferensi) — tidak pernah untuk otorisasi
- Setiap request ke API yang butuh auth wajib membawa Firebase ID Token, diverifikasi server

### 2. Secret Separation
- `FIREBASE_PRIVATE_KEY` dan `FIREBASE_CLIENT_EMAIL` → server-only (env vars)
- Web config (`FIREBASE_API_KEY`, dll) → aman di frontend, hanya bisa akses sesuai Security Rules
- Tidak ada secret yang di-embed ke file JS frontend

### 3. Atomic Operations
- Konsumsi limit menggunakan `firebase.transaction()` untuk mencegah race condition
- Redeem kode juga atomik — tidak bisa double-redeem

---

## Security Headers (Helmet)

Dikonfigurasi di `server/middleware/security.js`:

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' *.googleapis.com *.gstatic.com; connect-src 'self' *.googleapis.com *.firebaseio.com; img-src * data:; font-src *.gstatic.com
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

---

## Rate Limiting

| Endpoint Group | Limit | Window |
|----------------|-------|--------|
| Semua endpoint | 100 req | 15 menit |
| `/api/auth/*` | 20 req | 15 menit |
| `/api/generator/*` | 5 req | 1 menit |
| `/api/redeem` | 10 req | 10 menit |

Dikonfigurasi via env vars:
```env
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
AUTH_RATE_LIMIT_MAX=20
GENERATOR_RATE_LIMIT_MAX=5
REDEEM_RATE_LIMIT_MAX=10
```

---

## Duplicate Request Protection

Header `x-request-id` wajib di setiap request mutating. Server menyimpan ID yang sudah diproses dalam Map (10 menit TTL) dan menolak request duplikat — mencegah double-submit.

---

## Input Sanitization

Library `xss` dijalankan secara rekursif pada seluruh `req.body` di middleware `sanitizeBody()`. Semua string field dibersihkan sebelum diproses.

---

## Role-Based Access Control

Hierarki (dari terendah ke tertinggi):

```
user (0) < premium (1) < moderator (2) < admin (3) < owner (4)
```

Aturan penting:
- Tidak ada endpoint publik untuk mengubah role ke `owner`
- `owner` hanya di-set via env var `OWNER_UID` saat register pertama kali
- Admin tidak bisa elevate role melebihi level dirinya sendiri
- Tidak ada user yang bisa mengubah role sendiri

---

## Firebase Security Rules

Prinsip least-privilege di `firebase/database.rules.json`:
- Default: `".read": false, ".write": false`
- User hanya bisa baca data miliknya sendiri
- Semua penulisan data penting hanya via Firebase Admin SDK (server-side)
- Pengaturan sistem (`system/settings`) read-only untuk public (cek maintenance)

---

## CORS Configuration

```js
origin: process.env.ALLOWED_ORIGINS || 'https://yourdomain.vercel.app'
methods: ['GET', 'POST', 'PUT', 'DELETE']
credentials: true
```

Untuk development, set `ALLOWED_ORIGINS=http://localhost:3000`.

---

## Checklist Keamanan Produksi

### Wajib
- [ ] `.env` tidak ter-commit ke Git (ada di `.gitignore`)
- [ ] `serviceAccountKey.json` tidak ter-commit
- [ ] `OWNER_UID` diisi — tidak ada default owner
- [ ] `JWT_SECRET` random, min 32 karakter
- [ ] Firebase Security Rules sudah di-deploy (bukan test mode)
- [ ] HTTPS aktif (Vercel otomatis, VPS pakai Certbot)
- [ ] `ALLOWED_ORIGINS` diisi domain produksi yang benar

### Disarankan
- [ ] Enable Firebase App Check untuk proteksi tambahan
- [ ] Monitor log admin secara berkala
- [ ] Rotate `JWT_SECRET` secara berkala (logout semua user)
- [ ] Review rate limit settings sesuai traffic
- [ ] Set `NODE_ENV=production` di deployment

---

## Melaporkan Kerentanan

Jika menemukan celah keamanan, hubungi langsung via:
- Instagram: [@itshanzpiw](https://instagram.com/itshanzpiw)
- Jangan publish secara publik sebelum ada patch

---

## Hal yang TIDAK Boleh Dilakukan

| Jangan | Lakukan Ini |
|-----------|---------------|
| Simpan role di localStorage | Validasi role dari DB via server |
| Panggil API Alight Motion dari frontend | Panggil via backend proxy |
| Commit `.env` ke Git | Gunakan env vars di platform |
| Percaya input user tanpa sanitasi | Gunakan middleware `sanitizeBody()` |
| Skip rate limiting | Aktifkan semua limiter |
| Biarkan Firebase dalam test mode | Deploy Security Rules |
| Expose private key di response API | Gunakan `/api/firebase-config` yang sudah difilter |
