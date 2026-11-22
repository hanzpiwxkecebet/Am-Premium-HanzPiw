# Panduan Instalasi — AM Premium Generator V2.0

## Prasyarat

| Software | Versi Minimum |
|----------|--------------|
| Node.js  | 18.x LTS     |
| npm      | 9.x          |
| Git      | 2.x          |

## 1. Clone / Extract Project

```bash
# Clone dari repo (jika menggunakan Git)
git clone https://github.com/HanzPiw/am-premium-generator.git
cd am-premium-generator

# ATAU extract dari ZIP yang sudah didownload
unzip am-premium-generator.zip
cd am-premium-generator
```

## 2. Install Dependencies

```bash
npm install
```

## 3. Konfigurasi Environment

Salin file `.env.example` menjadi `.env`:

```bash
cp .env.example .env
```

Edit `.env` dan isi semua nilai yang diperlukan:

```bash
nano .env   # atau pakai editor lain
```

Lihat [docs/FIREBASE_SETUP.md](./FIREBASE_SETUP.md) untuk cara mendapatkan nilai Firebase.

**Field wajib yang HARUS diisi:**
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_DATABASE_URL`
- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_APP_ID`
- `OWNER_UID`
- `JWT_SECRET` (isi random string minimal 32 karakter)

## 4. Upload Firebase Security Rules

```bash
# Install Firebase CLI (jika belum)
npm install -g firebase-tools

# Login
firebase login

# Deploy rules ke project Firebase kamu
firebase deploy --only database --project YOUR_PROJECT_ID
```

Atau upload manual via Firebase Console:
1. Buka Firebase Console → Realtime Database → Rules
2. Copy-paste isi `firebase/database.rules.json`
3. Klik **Publish**

## 5. Jalankan Secara Lokal

```bash
# Mode development (dengan nodemon)
npm run dev

# Mode production
npm start
```

Server berjalan di `http://localhost:3000` (atau port yang dikonfigurasi).

## 6. Set Owner Pertama

Sebelum bisa login ke Owner Panel:

1. Daftarkan akun baru di aplikasi (`/pages/register.html`)
2. Setelah register, salin **Firebase UID** akun tersebut dari Firebase Console:
   - Buka Firebase Console → Authentication → Users
   - Cari akun kamu, klik untuk melihat UID
3. Set `OWNER_UID` di `.env` dengan UID tersebut
4. Restart server
5. Login ulang — akun kamu akan otomatis mendapat role `owner`

## 7. Verifikasi Instalasi

Cek endpoint berikut:
```
GET http://localhost:3000/api/public/status
```

Response yang benar:
```json
{
  "success": true,
  "data": {
    "maintenance": false,
    "version": "2.0.0"
  }
}
```

## Troubleshooting

| Error | Solusi |
|-------|--------|
| `Cannot find module firebase-admin` | Jalankan `npm install` |
| `FIREBASE_PRIVATE_KEY invalid` | Pastikan newline di `.env` pakai `\n` literal, bukan baris baru |
| `Database URL invalid` | Format: `https://PROJECT_ID-default-rtdb.firebaseio.com` |
| `Port already in use` | Ganti `PORT` di `.env` atau kill process yang pakai port tersebut |
| `OWNER_UID not set` | Tambahkan `OWNER_UID=uid_kamu` di `.env` lalu restart |
