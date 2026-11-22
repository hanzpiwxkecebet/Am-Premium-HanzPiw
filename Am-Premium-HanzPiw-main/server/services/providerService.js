// Menentukan metode daftar user ('google' | 'email') dari data Firebase Authentication.
// Dipakai untuk mengisi (backfill) user lama yang belum punya field `provider`.

/**
 * userRecord = hasil auth.getUser() / auth.listUsers().
 * Aturan: kalau akun punya password, berarti daftar lewat form email; selain itu (hanya Google) = 'google'.
 */
function providerFromRecord(userRecord) {
  const list = (userRecord && userRecord.providerData) || [];
  const ids = list.map((p) => p.providerId);
  if (ids.includes('password')) return 'email';
  if (ids.includes('google.com')) return 'google';
  return 'email';
}

/**
 * Cari provider untuk sekumpulan uid sekaligus (lewat listUsers, 1000 akun per halaman).
 * Return { [uid]: 'google' | 'email' | 'unknown' }. uid yang tidak ada di Auth (akun sudah dihapus) = 'unknown'.
 */
async function lookupProviders(auth, uids) {
  const need = new Set(uids);
  const result = {};
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const rec of page.users) {
      if (need.has(rec.uid)) result[rec.uid] = providerFromRecord(rec);
    }
    pageToken = page.pageToken;
  } while (pageToken && Object.keys(result).length < need.size);

  for (const uid of need) if (!result[uid]) result[uid] = 'unknown';
  return result;
}

module.exports = { providerFromRecord, lookupProviders };
