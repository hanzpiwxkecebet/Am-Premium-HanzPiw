# AM Premium Generator V2.0 Beta

<div align="center">

![Version](https://img.shields.io/badge/version-2.0.0--beta-ff2244?style=for-the-badge)
![Node.js](https://img.shields.io/badge/node.js-18%2B-339933?style=for-the-badge&logo=node.js)
![Firebase](https://img.shields.io/badge/firebase-RTDB-FFCA28?style=for-the-badge&logo=firebase)
![Vercel](https://img.shields.io/badge/deploy-vercel-000?style=for-the-badge&logo=vercel)

**Sistem generator Alight Motion Premium dengan autentikasi, manajemen limit, dan panel admin lengkap.**

*Developed by [@itshanzpiw](https://instagram.com/itshanzpiw)*

</div>

---

## ✨ Fitur Utama

| Fitur | Keterangan |
|-------|-----------|
| 🔐 **Multi-Auth** | Email/password + Google OAuth |
| 👤 **Username Login** | Login pakai username, bukan hanya email |
| 📊 **Daily Limit** | Limit harian reset otomatis jam 00:00 WIB |
| 🎟 **Redeem Code** | Kode untuk limit/premium/special access |
| 👑 **5 Level Role** | user → premium → moderator → admin → owner |
| 📧 **System Emails** | Pool email sistem dengan locking concurrent |
| 🛡 **Admin Panel** | Kelola user, kode, email, pengumuman, sistem |
| 👑 **Owner Panel** | Full control + danger zone + activity logs |
| 🔔 **Announcements** | Pengumuman prioritas tinggi/normal |
| 🛠 **Maintenance Mode** | Blokir akses saat maintenance |
| 🌙 **Dark/Light Mode** | Tema otomatis sesuai preferensi |
| 🎨 **Dark Neon Fusion** | Desain glassmorphism + partikel animasi |

---

## 🏗 Struktur Project

```
am-premium-generator/
├── server/
│   ├── config/
│   │   └── firebase.js          # Init Firebase Admin SDK
│   ├── controllers/
│   │   ├── authController.js    # Register, login, profil
│   │   ├── generatorController.js # Send/verify Alight Motion
│   │   ├── adminController.js   # Semua fungsi admin
│   │   └── redeemController.js  # Redeem kode
│   ├── middleware/
│   │   ├── auth.js              # Verifikasi token & role
│   │   ├── rateLimiter.js       # Rate limiting per endpoint
│   │   └── security.js          # Helmet, XSS, deduplicate
│   ├── routes/
│   │   ├── auth.js
│   │   ├── generator.js
│   │   ├── admin.js
│   │   ├── redeem.js
│   │   └── public.js
│   ├── services/
│   │   ├── apiService.js        # Proxy ke API Alight Motion
│   │   ├── limitService.js      # Manajemen limit (atomic)
│   │   └── auditService.js      # Audit log admin
│   └── index.js                 # Entry point Express
│
├── public/
│   ├── index.html               # Loading + boot sequence
│   ├── assets/
│   │   ├── css/main.css         # Dark Neon Fusion theme
│   │   └── js/
│   │       ├── firebase-init.js # Firebase client init
│   │       ├── auth.js          # Auth flow
│   │       ├── particles.js     # Canvas particles
│   │       ├── notifications.js # Toast + suara
│   │       ├── theme.js         # Dark/light mode
│   │       ├── nav.js           # Bottom nav + sidebar
│   │       └── utils.js         # Helper functions
│   └── pages/
│       ├── login.html
│       ├── register.html
│       ├── dashboard.html
│       ├── generator.html
│       ├── history.html
│       ├── redeem.html
│       ├── updates.html
│       ├── profile.html
│       ├── admin.html
│       ├── owner.html
│       └── maintenance.html
│
├── firebase/
│   ├── database.rules.json      # Firebase RTDB Security Rules
│   └── firebase.json            # Firebase project config
│
├── docs/
│   ├── INSTALLATION.md
│   ├── FIREBASE_SETUP.md
│   ├── API_SETUP.md
│   ├── DEPLOYMENT.md
│   └── SECURITY.md
│
├── .env.example
├── .gitignore
├── vercel.json
├── package.json
└── README.md
```

---

## 🚀 Quick Start

### 1. Install

```bash
git clone https://github.com/HanzPiw/am-premium-generator.git
cd am-premium-generator
npm install
cp .env.example .env
```

### 2. Setup Firebase

Lihat panduan lengkap: [docs/FIREBASE_SETUP.md](./docs/FIREBASE_SETUP.md)

```env
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-service-account@...iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_DATABASE_URL=https://your-project-default-rtdb.firebaseio.com
FIREBASE_API_KEY=AIzaSy...
FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
FIREBASE_APP_ID=1:...:web:...
```

### 3. Jalankan

```bash
npm run dev    # development
npm start      # production
```

### 4. Set Owner

1. Register akun baru
2. Salin UID dari Firebase Console → Authentication
3. Set `OWNER_UID=uid_kamu` di `.env`
4. Restart server

---

## 🌐 Deploy ke Vercel

```bash
# 1. Push ke GitHub
git add . && git commit -m "deploy" && git push

# 2. Import di vercel.com/new
# 3. Set semua env vars di Vercel Dashboard
# 4. Deploy
```

Panduan lengkap: [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)

---

## 🛡 Keamanan

| Lapisan | Implementasi |
|---------|-------------|
| Auth | Firebase ID Token (JWT) |
| RBAC | 5 level role, divalidasi server-side |
| Atomic | Firebase `.transaction()` untuk limit & redeem |
| Rate Limit | express-rate-limit per endpoint group |
| Input | XSS sanitization pada semua body |
| Headers | Helmet + CSP |
| Dedup | x-request-id tracking |
| Rules | Firebase Security Rules (least-privilege) |

Panduan keamanan lengkap: [docs/SECURITY.md](./docs/SECURITY.md)

---

## 🎨 Desain

**Dark Neon Fusion** — perpaduan Deep Black + Dark Red Neon + Dark Blue Neon

- Background animasi gradient
- Glassmorphism cards
- Canvas particle system
- Neon glow effects
- Smooth transitions
- Responsive (mobile-first)
- Light mode support

---

## 📡 API Backend

Base URL: `/api`

| Method | Endpoint | Auth | Keterangan |
|--------|----------|------|-----------|
| `POST` | `/auth/register` | ❌ | Daftar akun baru |
| `POST` | `/auth/login` | ❌ | (via Firebase Client) |
| `GET` | `/auth/profile` | ✅ | Data profil |
| `POST` | `/generator/send` | ✅ | Kirim verifikasi |
| `POST` | `/generator/verify` | ✅ | Verifikasi link |
| `GET` | `/generator/limit` | ✅ | Cek sisa limit |
| `GET` | `/generator/history` | ✅ | Riwayat penggunaan |
| `POST` | `/redeem` | ✅ | Redeem kode |
| `GET` | `/admin/users` | 🛡 Admin | Daftar user |
| `GET` | `/admin/stats` | 🛡 Admin | Statistik |
| `POST` | `/admin/redeem` | 🛡 Admin | Buat kode |
| `GET` | `/public/status` | ❌ | Status sistem |

---

## 📄 Dokumentasi

- [Instalasi Lokal](./docs/INSTALLATION.md)
- [Setup Firebase](./docs/FIREBASE_SETUP.md)
- [Setup API](./docs/API_SETUP.md)
- [Deployment](./docs/DEPLOYMENT.md)
- [Keamanan](./docs/SECURITY.md)

---

## 📦 Dependencies

```json
{
  "express": "^4.18.x",
  "firebase-admin": "^11.x",
  "axios": "^1.x",
  "cors": "^2.x",
  "dotenv": "^16.x",
  "express-rate-limit": "^6.x",
  "helmet": "^7.x",
  "uuid": "^9.x",
  "express-validator": "^7.x",
  "xss": "^1.x"
}
```

---

## ⚠️ Disclaimer

> Aplikasi ini dibuat untuk tujuan edukasi dan penggunaan pribadi.
> Gunakan sesuai Terms of Service Alight Motion.
> Developer tidak bertanggung jawab atas penyalahgunaan.

---

<div align="center">

Made with ❤️ by **HanzPiw Official**

[![Instagram](https://img.shields.io/badge/@itshanzpiw-E4405F?style=flat&logo=instagram&logoColor=white)](https://instagram.com/itshanzpiw)

</div>
