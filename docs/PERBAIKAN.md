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
