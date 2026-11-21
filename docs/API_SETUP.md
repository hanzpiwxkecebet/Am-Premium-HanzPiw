# Setup API — AM Premium Generator V2.0

## API yang Digunakan

Aplikasi ini menggunakan third-party API untuk proses verifikasi Alight Motion Premium:

**Base URL:** `https://ellreyxml.web.id/alight-motion`

---

## Endpoints

### 1. Send Verification Email

```
GET /send?email={email}
```

**Parameters:**
| Param | Tipe | Keterangan |
|-------|------|------------|
| `email` | string | Email Alight Motion yang akan diproses |

**Response (sukses):**
```json
{
  "success": true,
  "message": "...",
  "status": "sent"
}
```

**Response (gagal):**
```json
{
  "success": false,
  "message": "...",
  "status": "failed"
}
```

---

### 2. Verify Link

```
GET /verify?email={email}&link={verif_link}
```

**Parameters:**
| Param | Tipe | Keterangan |
|-------|------|------------|
| `email` | string | Email yang sama dengan saat send |
| `link` | string | Link verifikasi yang diterima di email |

**Response (sukses):**
```json
{
  "success": true,
  "message": "Premium activated",
  "status": "verified"
}
```

> ⚠️ **PENTING:** Sukses dihitung **HANYA** dari response endpoint `/verify`, bukan dari `/send`.

---

## Konfigurasi di `.env`

```env
API_BASE_URL=https://ellreyxml.web.id/alight-motion
```

---

## Aturan Penggunaan API

1. **API dipanggil dari server saja** — tidak pernah dari browser/frontend
2. **Jangan bypass** mekanisme verifikasi — gunakan API sesuai alur yang ditentukan
3. **Rate limiting** diterapkan di sisi server untuk mencegah abuse
4. **Timeout**: endpoint `/send` memiliki timeout 60 detik dengan 2x retry
5. **Endpoint `/verify`**: tidak ada retry (sekali panggil)

---

## Alur Lengkap Generator

```
User input email
      │
      ▼
Backend cek limit user (atomic transaction)
      │
      ▼
Backend panggil API /send?email=...
      │
      ▼ (jika send berhasil)
Tampilkan form input link verifikasi ke user
      │
      ▼ (user paste link dari email)
Backend panggil API /verify?email=...&link=...
      │
      ├── verify success = true  → Proses BERHASIL, update stats
      └── verify success = false → Proses GAGAL, refund limit
```

---

## Troubleshooting API

| Error | Kemungkinan Penyebab | Solusi |
|-------|----------------------|--------|
| `API timeout` | Server API sedang lambat | Coba lagi setelah beberapa saat |
| `Send failed: email invalid` | Format email salah | Pastikan email valid |
| `Verify failed` | Link sudah expired atau salah | Minta user ulangi dari awal |
| `API offline` | Server third-party down | Tunggu atau hubungi pemilik API |
| `ECONNREFUSED` | `API_BASE_URL` salah di `.env` | Cek konfigurasi |

---

## Cek Status API

```
GET /api/generator/api-status
```

Response:
```json
{
  "success": true,
  "data": {
    "online": true,
    "latency": 234
  }
}
```

---

## Catatan Developer

Fungsi `determineVerifySuccess()` di `server/services/apiService.js` adalah adapter yang menginterpretasikan response API. Jika API mengganti format response, update adapter tersebut:

```js
// server/services/apiService.js
function determineVerifySuccess(data) {
  // Sesuaikan dengan kontrak API yang sebenarnya
  if (typeof data.success === 'boolean') return data.success;
  if (data.status === 'success' || data.status === 'verified') return true;
  if (data.code === 200 || data.code === 'OK') return true;
  if (typeof data.message === 'string') {
    const msg = data.message.toLowerCase();
    if (msg.includes('success') || msg.includes('premium') || msg.includes('activated')) return true;
    if (msg.includes('failed') || msg.includes('invalid') || msg.includes('error')) return false;
  }
  return false;
}
```
