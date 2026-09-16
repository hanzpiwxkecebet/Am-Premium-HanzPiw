# ⚡ AM Premium Free by HanzPiw

> **Unlock Your Motion. Create Without Limits.**

Generator Alight Motion Premium dengan tampilan premium, futuristik, dan modern.

[![Version](https://img.shields.io/badge/version-1.0.0%20Beta-red)](https://github.com)
[![Node](https://img.shields.io/badge/node-%3E%3D18-blue)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

---

## ✨ Features

- ⚡ **Generator 2-Step** — Send & Verify Alight Motion Premium
- 🎨 **Premium Dark Neon UI** — Red/Blue neon futuristic design
- 📊 **Firebase Statistics** — Real-time stats dari Firebase
- 🔐 **Admin Dashboard** — Kelola semua aspek website
- 🛠️ **Maintenance Mode** — Toggle via admin panel
- 📢 **Broadcast System** — Buat pengumuman untuk user
- 🚦 **Rate Limiting & Cooldown** — Perlindungan dari spam
- 🔒 **Security** — Helmet, CORS, input validation
- 📱 **Fully Responsive** — Mobile-first design
- 🌙 **Dark/Light Mode** — Simpan di localStorage
- 🌐 **Vercel Ready** — Deploy mudah dan cepat

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML5, CSS3, Vanilla JavaScript |
| Backend | Node.js, Express.js |
| Database | Firebase Firestore |
| HTTP Client | Axios |
| Security | Helmet, CORS, express-rate-limit |
| Deployment | Vercel, GitHub |

---

## 🚀 Quick Start

### 1. Clone / Extract

```bash
# Setelah extract ZIP
cd AM-Premium-Free-by-HanzPiw
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Setup Environment

```bash
cp .env.example .env
# Edit .env dengan text editor favorit kamu
nano .env
```

### 4. Jalankan Development Server

```bash
npm run dev
```

Buka browser: `http://localhost:3000`

---

## 🔥 Firebase Setup

### Langkah 1: Buat Project Firebase

1. Buka [Firebase Console](https://console.firebase.google.com)
2. Klik **Create Project** → ikuti wizard
3. Aktifkan **Firestore Database** (production mode)
4. Aktifkan **Authentication** → Email/Password

### Langkah 2: Service Account (Backend)

1. Project Settings → **Service Accounts**
2. Klik **Generate New Private Key**
3. Download file JSON
4. Salin nilai-nilai ke `.env`:

```env
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY\n-----END PRIVATE KEY-----\n"
```

### Langkah 3: Firebase Client (Frontend)

1. Project Settings → **Your apps** → Add Web App
2. Salin firebaseConfig
3. Update di `pages/admin/login.html` dan `pages/admin/dashboard.html`:

```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc..."
};
```

### Langkah 4: Firestore Rules

Buka Firestore → Rules, set rules berikut:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /stats/{doc} {
      allow read: if true;
      allow write: if false;
    }
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

---

## 🔐 Admin Setup

### 1. Buat Admin User di Firebase Auth

1. Firebase Console → Authentication → Users
2. Klik **Add User**
3. Masukkan email dan password admin
4. Simpan credentials dengan aman

### 2. Login ke Dashboard

Buka: `http://localhost:3000/admin/login`

Gunakan email/password yang dibuat di Firebase Auth.

---

## 🔑 Environment Variables

| Variable | Deskripsi | Contoh |
|----------|-----------|--------|
| `NODE_ENV` | Environment | `production` |
| `PORT` | Port server | `3000` |
| `FRONTEND_URL` | URL frontend untuk CORS | `https://your-domain.vercel.app` |
| `API_BASE_URL` | Base URL external API | `https://ellreyxml.web.id/alight-motion` |
| `API_TIMEOUT` | Timeout API (ms) | `60000` |
| `FIREBASE_PROJECT_ID` | Firebase project ID | `your-project-id` |
| `FIREBASE_CLIENT_EMAIL` | Firebase service account email | `...@...iam.gserviceaccount.com` |
| `FIREBASE_PRIVATE_KEY` | Firebase private key | `"-----BEGIN PRIVATE KEY-----\n..."` |
| `ADMIN_SECRET` | Secret key fallback admin | `super-secret-key` |
| `COOLDOWN_SECONDS` | Cooldown antar request (detik) | `30` |
| `RATE_LIMIT_WINDOW` | Window rate limit (ms) | `60000` |
| `RATE_LIMIT_MAX` | Max request per window | `10` |

---

## 🌐 Deploy ke Vercel

### Langkah 1: Push ke GitHub

```bash
git init
git add .
git commit -m "Initial commit: AM Premium Free by HanzPiw"
git remote add origin https://github.com/USERNAME/am-premium-free.git
git push -u origin main
```

### Langkah 2: Import ke Vercel

1. Buka [Vercel Dashboard](https://vercel.com/dashboard)
2. Klik **New Project** → Import dari GitHub
3. Pilih repository kamu
4. Framework: **Other**

### Langkah 3: Set Environment Variables

Di Vercel Dashboard → Project → Settings → Environment Variables:

Tambahkan semua variable dari `.env` (kecuali yang default/dev).

**Penting untuk `FIREBASE_PRIVATE_KEY`:**
Paste nilai lengkap dengan newline literal (bukan `\n`), atau gunakan format:
```
"-----BEGIN PRIVATE KEY-----\nABCD...\n-----END PRIVATE KEY-----\n"
```

### Langkah 4: Deploy

Klik **Deploy**. Setiap push ke `main` akan auto-deploy.

---

## 🔧 Konfigurasi API

Default API yang digunakan:

| Endpoint | URL |
|----------|-----|
| Base | `https://ellreyxml.web.id/alight-motion` |
| Send | `https://ellreyxml.web.id/alight-motion/send` |
| Verify | `https://ellreyxml.web.id/alight-motion/verify` |

Dapat diubah melalui:
- Environment variable `API_BASE_URL`
- Admin Dashboard → API Settings

---

## 📁 Project Structure

```
AM-Premium-Free-by-HanzPiw/
├── api/
│   └── index.js                 # Vercel entry point
├── server/
│   ├── routes/
│   │   ├── generator.js         # Generator routes
│   │   ├── stats.js             # Stats routes
│   │   └── admin.js             # Admin routes
│   ├── controllers/
│   │   ├── generatorController.js
│   │   └── adminController.js
│   ├── middleware/
│   │   ├── auth.js              # Admin auth
│   │   ├── rateLimiter.js       # Rate limiting
│   │   └── maintenance.js       # Maintenance mode
│   ├── services/
│   │   ├── apiService.js        # External API calls
│   │   └── firebaseService.js   # Firebase operations
│   ├── firebase/
│   │   └── config.js            # Firebase Admin init
│   └── utils/
│       └── helpers.js           # Helper functions
├── public/
│   ├── assets/
│   │   ├── logo/logo.svg
│   │   ├── favicon/favicon.svg
│   │   └── video/               # (taruh bg.mp4 di sini)
│   ├── css/
│   │   ├── main.css             # Main styles
│   │   └── admin.css            # Admin styles
│   └── js/
│       ├── app.js               # Core app JS
│       ├── generator.js         # Generator logic
│       ├── admin.js             # Admin dashboard JS
│       └── history.js           # History page JS
├── pages/
│   ├── index.html               # Home
│   ├── generator.html           # Generator
│   ├── tutorial.html            # Tutorial
│   ├── faq.html                 # FAQ
│   ├── about.html               # About
│   ├── contact.html             # Contact
│   ├── history.html             # History
│   ├── 404.html                 # 404 Page
│   └── admin/
│       ├── login.html           # Admin login
│       └── dashboard.html       # Admin dashboard
├── .env.example
├── .gitignore
├── package.json
├── server.js                    # Main Express app
├── vercel.json
└── README.md
```

---

## 🎨 Background Video (Opsional)

Taruh file video futuristik di `public/assets/video/`:
- `bg.mp4` — Format utama
- `bg.webm` — Fallback Firefox

Update `pages/index.html` untuk mengaktifkan video:

```html
<div class="bg-video-wrap">
  <video id="bgVideo" autoplay muted loop playsinline>
    <source src="/public/assets/video/bg.mp4" type="video/mp4"/>
    <source src="/public/assets/video/bg.webm" type="video/webm"/>
  </video>
</div>
```

Jika video tidak ada, animated gradient akan digunakan otomatis.

---

## 🔒 Security Notes

- **Jangan commit `.env`** ke GitHub (sudah ada di `.gitignore`)
- **Firebase private key** hanya di environment variable, tidak di code
- **Admin password** dikelola sepenuhnya oleh Firebase Auth
- **Email user** disimpan dalam bentuk masked (ha***@gmail.com)
- Rate limiting aktif pada semua endpoint API
- Semua input divalidasi dan disanitasi di backend

---

## 🐛 Troubleshooting

**Firebase error: "Cannot read property of undefined"**
→ Pastikan semua `FIREBASE_*` environment variables sudah diisi dengan benar.

**CORS error di production**
→ Set `FRONTEND_URL` ke URL Vercel kamu (contoh: `https://am-premium.vercel.app`)

**Admin login gagal**
→ Pastikan Firebase Authentication Email/Password sudah diaktifkan dan user sudah dibuat.

**API timeout**
→ Default timeout 60 detik. Naikkan `API_TIMEOUT` jika perlu.

**Rate limit terlalu ketat**
→ Ubah `RATE_LIMIT_MAX` dan `COOLDOWN_SECONDS` di `.env` atau Admin Dashboard.

---

## 📞 Contact

| Platform | Info |
|----------|------|
| Telegram Owner | [@itshanzpiw](https://t.me/itshanzpiw) |
| WhatsApp | 085191782145 |
| Telegram Channel | [t.me/hanzpiwnakberak](https://t.me/hanzpiwnakberak) |
| WhatsApp Channel | [Channel Link](https://whatsapp.com/channel/0029VbDvpID7oQhXPaT1ar1B) |

---

## 📄 License

MIT License — © 2024 HanzPiw Official

---

> *Unlock Your Motion. Create Without Limits.* — **HanzPiw Official**
