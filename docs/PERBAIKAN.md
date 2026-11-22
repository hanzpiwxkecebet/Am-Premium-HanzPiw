# Catatan Perbaikan (Nov 2026)

## Cara cek cepat setelah deploy
Buka `https://DOMAIN-KAMU/api/health?deep=1` — hasilnya langsung bilang bagian mana yang rusak
(`credential` / `rest` / `websocket`) beserta `hint` saran perbaikan. Tidak menampilkan secret.

## Yang diubah
| File | Perubahan |
|------|-----------|
| `server/config/firebase.js` | Env dibersihkan (kutip/spasi/`/`), URL database divalidasi (gagal cepat, bukan menggantung), koneksi RTDB dibuat ulang otomatis kalau instance idle >25 dtk, `diagnose()` 3 tahap |
| `server/index.js` | `/api/health?deep=1` diagnosa lengkap + hint; `?warm=1` buka koneksi DB lebih awal; timer 8 dtk tidak lagi memotong `/generator/send` & `/verify` (API pihak ketiga); koneksi di-reset saat timeout |
| `server/services/apiService.js` | Status API: HTTP <500 = online (sebelumnya 404 = offline), cache 30 dtk, `API_BASE_URL` dibersihkan, budget total 50 dtk |
| `server/routes/public.js`, `generator.js` | `/api/public/api-status` baru tanpa login & tanpa database |
| `server/middleware/rateLimiter.js` | Limit login 20 → 80 per 15 menit (CGNAT seluler) |
| `public/pages/dashboard.html` | Status API dimuat langsung (tidak menunggu login/DB) |
| `public/pages/generator.html` | Timeout klien 60 dtk untuk send/verify (sebelumnya 10 dtk) |
| `public/index.html` | Cek maintenance paralel & maks 1,5 dtk; transisi splash dipercepat |
| `vercel.json` + `api/index.js` | Struktur Vercel modern: `maxDuration` 60 dtk, rewrite `/api/*` |
| `firebase/database.rules.json` | Path `redeem`/`emails` benar + `.indexOn` (publish ulang di Firebase Console) |

## Pengaturan manual di Vercel
1. **Settings → Functions → Function Region**: samakan dengan region database
   (host terlihat di `/api/health?deep=1` → `database.host`).
   `...firebaseio.com` = US → biarkan `iad1`; `...asia-southeast1...` = Singapore → pilih `sin1`.
2. Setelah mengganti env var, wajib **Redeploy**.
3. Firebase Console → Realtime Database → Rules → paste isi `firebase/database.rules.json` → Publish.

## Update: URL, Backsound, Updates (Nov 2026)
- **URL `/pages/xxx.html` dihapus.** Siapa pun yang membuka alamat lama itu diarahkan ke halaman "Menu tidak ditemukan" (`public/404.html`) dengan tombol *Kembali ke Dashboard*. URL tidak dikenal lain juga menampilkan halaman yang sama (status 404).
- **Backsound** (`public/assets/js/backsound.js`, dimuat di semua halaman): default aktif, otomatis diputar. Browser memblokir autoplay sebelum ada interaksi, jadi musik mulai di sentuhan/klik pertama. Posisi lagu dilanjutkan saat pindah halaman. User bisa mematikan/menyalakan lewat tombol speaker (pilihan user mengalahkan default owner).
- **Owner**: `/owner` -> tab *Sistem* -> *Backsound Default* (aktif/nonaktif) dan *URL Audio Backsound*. Disimpan di `system/backsoundEnabled` & `system/backsoundUrl`; dibaca publik lewat `/api/public/status` (`backsound`). Hanya role owner yang bisa mengubahnya.
- **Updates & Dashboard**: link di teks pengumuman otomatis jadi link yang bisa diklik (tab baru). Preview tidak lagi memotong URL di tengah.
- **Bug Updates**: kartu pengumuman tidak bisa diklik sampai proses login selesai (listener baru dipasang setelah `Auth.init`); sekarang aktif langsung. Tombol "Tutup" di modal (Updates, History, Redeem) tidak berfungsi; sekarang menutup modal.
- CSP Express: ditambah `mediaSrc` supaya audio dari domain luar tidak diblokir saat dijalankan lewat Express.

## Update: backsound tanpa putus (Nov 2026)
- Penyebab musik putus: tiap pindah menu browser memuat ulang halaman, sehingga audio ikut berhenti.
- Solusi: **shell** (`public/shell.html` + `assets/js/shell.js`). Alamat menu (`/dashboard`, `/generator`, dst.) kini membuka shell yang tidak pernah reload; isi menu dimuat di iframe (`/dashboard?_embed=1`). Backsound hidup di shell, jadi lanjut terus saat pindah menu. Address bar tetap bersih dan tombol back/forward tetap jalan.
- `vercel.json`: `/login`, `/dashboard`, dll. -> `shell.html`; kalau ada `?_embed` -> halaman asli di `pages/`. Express (`server/index.js`) memakai aturan yang sama.
- Login Google mode redirect tidak bisa di iframe (Google melarang di-iframe), jadi `auth.js` keluar ke halaman login penuh dulu (`/login?_embed=1`), lalu `login.html` melanjutkan redirect.
- Halaman `/` (splash) dan 404 tetap halaman biasa; musik hanya mulai ulang sekali saat masuk dari sana (posisi lagu dilanjutkan).

## Update: logo, PWA, transisi, skeleton (Nov 2026)
- **Logo H hitam putih**: `public/favicon.svg`, `favicon.ico`, `apple-touch-icon.png`, `assets/icons/*` (192, 512, maskable). Terpasang di semua halaman.
- **PWA**: `manifest.webmanifest` + `sw.js` (network-first; `/api/` dan domain luar tidak pernah di-cache; offline menampilkan halaman "Offline"). Service worker didaftarkan oleh shell. Tombol **Install Aplikasi** ada di Profile (muncul hanya kalau bisa di-install; di iOS memberi petunjuk "Tambah ke Layar Utama"). Warna address bar mengikuti tema terang/gelap.
- **Transisi**: shell melakukan fade-out/fade-in saat pindah menu.
- **Tema**: perubahan tema di dalam menu ikut diterapkan ke shell (tidak ada kilatan warna saat pindah halaman).
- **Skeleton loading** ditambah di angka statistik dan nama di Dashboard, serta daftar email di Generator; terlihat juga di tema terang.
- Naikkan `CACHE` di `sw.js` (mis. `am-premium-v2`) kalau mau memaksa cache lama dibersihkan.

## Update: background kustom (Nov 2026)
- **Owner** (`/owner` -> tab *Sistem* -> kartu *Background Website*): tombol aktif/nonaktif, sumber **link gambar** atau **upload dari galeri/penyimpanan HP**, slider blur (0-24px, default 6), dan preview.
- **Nonaktif = tampilan bawaan** (gelombang abu-abu + partikel) persis seperti sebelumnya. Aktif = gambar jadi latar di semua halaman, di-blur dan diredupkan sedikit supaya teks terbaca (tema terang memakai peredam terang).
- Upload dikecilkan di browser (maks 1600px, JPEG) lalu dikirim ke `POST /api/admin/background` (owner saja). Server memeriksa isi file (JPEG/PNG/WebP asli; SVG ditolak) dan menyimpannya di `backgroundAsset/` (terpisah dari `system/` agar `/api/public/status` tetap kecil). Gambar disajikan lewat `GET /api/public/background?v=<versi>` dengan cache panjang; ganti gambar = versi baru.
- Setelan disimpan di `system/bgEnabled`, `bgSource` (`url`/`upload`), `bgUrl`, `bgBlur`, `bgVersion`, `bgHasUpload`; dibaca publik lewat `/api/public/status` (`background`).
- `assets/js/background.js` dimuat di `<head>` semua halaman (tanpa kedipan). Gambar digambar sekali di shell; halaman menu di iframe dibuat transparan, jadi tidak dimuat ulang saat pindah menu. Link yang rusak otomatis kembali ke tampilan bawaan.
- Setelah owner menyimpan, perubahan langsung terlihat (melewati cache edge); pengunjung lain mendapat pembaruan dalam sekitar 30 detik.

## Update: keamanan, race condition, logo (v2.0.2)

### Logo
- Logo HanzPiw baru: `public/assets/img/logo-full.png` (lengkap) dan `logo-mark.png` (huruf H). Dipakai lewat CSS mask (`.brand-logo`, `.brand-mark`), jadi warnanya otomatis ikut tema terang/gelap.
- Favicon, `apple-touch-icon`, ikon PWA (192/512/maskable) dibuat ulang dari logo. `sw.js` cache naik ke `am-premium-v2`.

### Perubahan perilaku
- **Premium kedaluwarsa otomatis.** Role `premium` dari redeem turun ke `user` saat `premiumExpiresAt` lewat (dicek di `verifyToken` dan `/auth/profile`). Redeem premium lagi saat masih aktif = diperpanjang dari sisa masa. Role yang diberi admin manual = permanen (masa dari redeem dihapus). Staff tidak pernah diturunkan.
- **Email sistem:** yang sudah dipakai tetap "Telah Digunakan"; **7 hari setelah dipakai dihapus otomatis** dari pool (`server/services/emailService.js`). Email yang dikunci tapi tidak diselesaikan dilepas lagi setelah 30 menit (`EMAIL_LOCK_TTL_MIN`), riwayatnya jadi `expired`.
  Perawatan jalan lewat Vercel Cron harian (`/api/cron/cleanup`, wajib env `CRON_SECRET`) dan juga saat daftar email dibuka (maks 1x/menit).
- **`/generator/verify` atomik:** tap ganda tidak lagi memanggil API pihak ketiga dua kali; email harus cocok dengan yang dikirimi verifikasi; metode (system/custom) dibaca dari catatan server.
- **`/generator/send`:** satu proses per user pada satu waktu (`pendingRequests/{uid}`).
- **Redeem atomik:** klaim kode per-user dilakukan lebih dulu; kalau gagal di tengah, kode dan klaim dikembalikan. Reward limit memakai limit default dinamis (bukan angka 20 tetap).
- **Login username:** email tidak lagi dikirim ke browser. Endpoint baru `POST /api/auth/login-username` (server cek password lalu membalas custom token) dan `GET /api/auth/username-available` untuk form daftar. Endpoint lama `GET /api/auth/username` dihapus.
- **Rate limit lintas instance** (disimpan di Firebase `rateLimits/`) untuk generate, verify, redeem, inbox, dan login.
- **Foto profil dipisah** ke `userPhotos/{uid}` & `userThumbs/{uid}`. Node `users/{uid}` jadi kecil, sehingga auth, limit, dan redeem jauh lebih ringan. Foto lama dipindah otomatis saat user membuka profil; atau jalankan `node scripts/migrate-photos.js --apply` sekali.
- Password tidak lagi di-trim/di-escape oleh sanitizer input.
- Timeout 8 dtk: setelah membalas 504, balasan handler berikutnya diabaikan (tidak ada error "headers already sent"). Untuk POST, pesannya menyuruh cek dulu apakah perubahan sudah tersimpan.
- `/api/generator/auto-email` dan `/api/generator/inbox` (mailService) sekarang tersambung ke route (belum ada tombol di UI).
- `engines.node` = `>=22`. Versi otomatis dari `package.json` (2.0.2).

### Yang wajib dilakukan setelah deploy
1. **Publish ulang** `firebase/database.rules.json` di Firebase Console (ada `.indexOn: status` untuk emails, node `userPhotos`, `userThumbs`, `rateLimits`).
2. Tambah env Vercel `CRON_SECRET` (string acak panjang) lalu **Redeploy**. Tanpa ini cron membalas 503 (aplikasi tetap jalan; penghapusan email 7 hari tetap terjadi lewat pembukaan daftar email).
3. Pastikan `FIREBASE_API_KEY` terisi di server (dipakai login username). Kalau API key dibatasi per referrer, isi juga `APP_URL`.
4. Opsional: `node scripts/migrate-photos.js --apply`.

### Tes
`npm test` (13 tes: redeem paralel, tap ganda verify, lock email, email 7 hari, premium, rate limit) dan `npm run check` (sintaks). Jalan tanpa koneksi/database. CI: `.github/workflows/ci.yml`.
