# Setup Firebase — AM Premium Generator V2.0

## Langkah 1: Buat Project Firebase

1. Buka [Firebase Console](https://console.firebase.google.com/)
2. Klik **Add project**
3. Masukkan nama project (misal: `am-premium-gen`)
4. Nonaktifkan Google Analytics (opsional)
5. Klik **Create project**

---

## Langkah 2: Aktifkan Authentication

1. Di sidebar kiri → **Build** → **Authentication**
2. Klik **Get started**
3. Tab **Sign-in method** → aktifkan:
   - **Email/Password** → Enable → Save
   - **Google** → Enable → masukkan support email → Save

---

## Langkah 3: Buat Realtime Database

1. Di sidebar kiri → **Build** → **Realtime Database**
2. Klik **Create Database**
3. Pilih region: **asia-southeast1 (Singapore)** (paling dekat untuk Indonesia)
4. Pilih **Start in test mode** (kita akan deploy rules sendiri)
5. Klik **Enable**
6. Salin **Database URL** (format: `https://PROJECT_ID-default-rtdb.asia-southeast1.firebasedatabase.app`)

### Upload Security Rules

1. Tab **Rules** di Realtime Database
2. Hapus rules yang ada, paste isi dari `firebase/database.rules.json`
3. Klik **Publish**

---

## Langkah 4: Buat Service Account (Backend)

1. Firebase Console → **Project Settings** → tab **Service accounts**
2. Klik **Generate new private key**
3. Klik **Generate key** — file JSON akan terdownload
4. **JANGAN commit file ini ke Git!**

Ambil nilai dari JSON tersebut:

```json
{
  "project_id": "→ FIREBASE_PROJECT_ID",
  "client_email": "→ FIREBASE_CLIENT_EMAIL",
  "private_key": "→ FIREBASE_PRIVATE_KEY (sertakan -----BEGIN...-----END-----)"
}
```

**Cara isi `FIREBASE_PRIVATE_KEY` di `.env`:**
```
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvAIBADA...\n-----END PRIVATE KEY-----\n"
```
> Penting: `\n` harus literal `\n` (backslash-n), bukan baris baru. Kutip dengan double-quote.

---

## Langkah 5: Ambil Web Config (Frontend)

1. Firebase Console → **Project Settings** → tab **General**
2. Scroll ke bawah → **Your apps** → klik ikon **</>** (Web)
3. Daftarkan app (nama bebas, misal `am-premium-web`)
4. Salin `firebaseConfig`:

```js
const firebaseConfig = {
  apiKey: "→ FIREBASE_API_KEY",
  authDomain: "→ FIREBASE_AUTH_DOMAIN",
  databaseURL: "→ FIREBASE_DATABASE_URL",
  projectId: "→ FIREBASE_PROJECT_ID",
  storageBucket: "→ FIREBASE_STORAGE_BUCKET",
  messagingSenderId: "→ FIREBASE_MESSAGING_SENDER_ID",
  appId: "→ FIREBASE_APP_ID"
};
```

---

## Langkah 6: Isi `.env`

```env
# Backend (Service Account)
FIREBASE_PROJECT_ID=am-premium-gen
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@am-premium-gen.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvAIBADA...\n-----END PRIVATE KEY-----\n"
FIREBASE_DATABASE_URL=https://am-premium-gen-default-rtdb.asia-southeast1.firebasedatabase.app

# Frontend (Web Config — aman untuk expose)
FIREBASE_API_KEY=AIzaSyXXXXXXXXXXXXX
FIREBASE_AUTH_DOMAIN=am-premium-gen.firebaseapp.com
FIREBASE_STORAGE_BUCKET=am-premium-gen.appspot.com
FIREBASE_MESSAGING_SENDER_ID=123456789012
FIREBASE_APP_ID=1:123456789012:web:abcdef123456
```

---

## Langkah 7: Authorized Domains (untuk Google Login)

1. Firebase Console → Authentication → Settings → **Authorized domains**
2. Tambahkan domain produksi kamu (misal: `am-premium.vercel.app`)
3. `localhost` sudah ada secara default

---

## Verifikasi

Test koneksi Firebase dengan menjalankan server:
```bash
npm run dev
```

Lalu akses:
```
GET http://localhost:3000/api/public/status
```

Jika response `200 OK` → Firebase berhasil terhubung.

---

## Catatan Keamanan

- **JANGAN** commit file `serviceAccountKey.json` ke Git
- **JANGAN** expose `FIREBASE_PRIVATE_KEY` ke frontend
- Hanya `FIREBASE_API_KEY`, `AUTH_DOMAIN`, `APP_ID` dll (web config) yang aman di frontend
- Private key hanya ada di server via environment variables
