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
