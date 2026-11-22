# Deployment Guide — AM Premium Generator V2.0

## Deploy ke Vercel (Recommended)

### Prasyarat
- Akun [Vercel](https://vercel.com) (gratis)
- Project sudah di-push ke GitHub

### Langkah 1: Push ke GitHub

```bash
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/USERNAME/am-premium-generator.git
git push -u origin main
```

### Langkah 2: Import ke Vercel

1. Buka [vercel.com/new](https://vercel.com/new)
2. Klik **Import Git Repository**
3. Pilih repo `am-premium-generator`
4. Konfigurasi:
   - **Framework Preset**: Other
   - **Root Directory**: `./` (default)
   - **Build Command**: _(kosongkan)_
   - **Output Directory**: `public`
5. Klik **Deploy**

### Langkah 3: Set Environment Variables

Di Vercel Dashboard → Project → **Settings** → **Environment Variables**:

| Key | Value |
|-----|-------|
| `FIREBASE_PROJECT_ID` | project id Firebase kamu |
| `FIREBASE_CLIENT_EMAIL` | email service account |
| `FIREBASE_PRIVATE_KEY` | private key (dengan `\n`) |
| `FIREBASE_DATABASE_URL` | database URL |
| `FIREBASE_API_KEY` | web config API key |
| `FIREBASE_AUTH_DOMAIN` | auth domain |
| `FIREBASE_STORAGE_BUCKET` | storage bucket |
| `FIREBASE_MESSAGING_SENDER_ID` | messaging sender ID |
| `FIREBASE_APP_ID` | app ID |
| `OWNER_UID` | Firebase UID akun owner |
| `JWT_SECRET` | random string 32+ karakter |
| `API_BASE_URL` | `https://ellreyxml.web.id/alight-motion` |
| `TZ` | `Asia/Jakarta` |

> **Tip:** Untuk `FIREBASE_PRIVATE_KEY`, paste nilai persis seperti di file JSON (dengan `\n` yang masih `\n`, bukan newline).
> Di Vercel, kamu bisa paste dengan newline sebenarnya — Vercel akan handle otomatis.

### Langkah 4: Deploy Ulang

Setelah set env vars → **Deployments** → klik **Redeploy** pada deployment terakhir.

### Langkah 5: Konfigurasi Domain

1. Vercel memberikan domain gratis: `am-premium-xxx.vercel.app`
2. Tambahkan ke Firebase Authorized Domains:
   - Firebase Console → Authentication → Settings → Authorized domains
   - Tambahkan domain Vercel kamu
3. (Opsional) Bisa pakai custom domain di Vercel → Settings → Domains

---

## Deploy ke VPS / Server Sendiri

### Prasyarat
- Ubuntu 20.04+ / Debian 11+
- Node.js 18+ terinstall
- PM2 (process manager)
- Nginx (reverse proxy)

### Install PM2

```bash
npm install -g pm2
```

### Setup Project

```bash
cd /var/www
git clone https://github.com/USERNAME/am-premium-generator.git
cd am-premium-generator
npm install
cp .env.example .env
nano .env  # isi semua nilai
```

### Jalankan dengan PM2

```bash
pm2 start server/index.js --name "am-premium" --env production
pm2 save
pm2 startup  # agar otomatis jalan saat reboot
```

### Konfigurasi Nginx

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### SSL dengan Certbot

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

---

## Verifikasi Deployment

Setelah deploy, cek endpoint:

```bash
curl https://yourdomain.com/api/public/status
```

Expected response:
```json
{"success":true,"data":{"maintenance":false,"version":"2.0.0"}}
```

---

## Update / Re-deploy

### Vercel (auto):
Push ke branch `main` → Vercel otomatis re-deploy.

### VPS:
```bash
cd /var/www/am-premium-generator
git pull
npm install
pm2 restart am-premium
```

---

## Checklist Sebelum Go Live

- [ ] Semua env vars terisi di Vercel/server
- [ ] Firebase Security Rules sudah di-deploy
- [ ] `OWNER_UID` sudah diset
- [ ] Domain sudah ditambahkan ke Firebase Authorized Domains
- [ ] Test register, login, generator
- [ ] Test owner panel
- [ ] Rate limiting berfungsi
- [ ] Maintenance mode bisa diaktifkan/nonaktifkan

## Email Sistem (generator.email)

Email sistem dibuat dan dikelola owner, user hanya memakainya:

1. Owner membuat alamat di https://generator.email/ (contoh `ezbtch444@nightgirls.site`).
2. Owner memasukkannya di **Admin Panel > Emails > + Tambah Email**.
3. Saat user memakai email itu, halaman Generator menampilkan tombol **Buka Inbox** ke
   `https://generator.email/ezbtch444@nightgirls.site`. User mengambil link verifikasi di sana, lalu menempelnya di web.
4. Email dikunci selama dipakai satu user dan dibuka lagi setelah user submit.
