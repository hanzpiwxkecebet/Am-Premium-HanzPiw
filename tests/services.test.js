const test = require('node:test');
const assert = require('node:assert/strict');
const { FakeDb } = require('./helpers');
const { isPremiumExpired, expirePremiumIfNeeded, extendPremium } = require('../server/services/premiumService');
const { maintainEmails, isUsedExpired, USED_RETENTION_MS, LOCK_TTL_MS } = require('../server/services/emailService');

const DAY = 24 * 60 * 60 * 1000;

test('premium: kedaluwarsa hanya untuk role premium yang punya masa aktif lewat', () => {
  const now = 1_000_000_000;
  assert.equal(isPremiumExpired({ role: 'premium', premiumExpiresAt: now - 1 }, now), true);
  assert.equal(isPremiumExpired({ role: 'premium', premiumExpiresAt: now + 1 }, now), false);
  assert.equal(isPremiumExpired({ role: 'premium' }, now), false, 'tanpa masa aktif = permanen (diberi admin)');
  assert.equal(isPremiumExpired({ role: 'admin', premiumExpiresAt: now - 1 }, now), false, 'staff tidak disentuh');
  assert.equal(isPremiumExpired({ role: 'user', premiumExpiresAt: now - 1 }, now), false);
});

test('premium: extendPremium memperpanjang dari sisa masa, bukan menimpa', () => {
  const now = 1_000_000_000;
  assert.equal(extendPremium(0, 30, now), now + 30 * DAY);
  assert.equal(extendPremium(now + 10 * DAY, 30, now), now + 40 * DAY);
  assert.equal(extendPremium(now - 5 * DAY, 30, now), now + 30 * DAY, 'masa lama sudah lewat: mulai dari sekarang');
});

test('premium: expirePremiumIfNeeded menurunkan role di database', async () => {
  const now = Date.now();
  const db = new FakeDb({ users: { u1: { role: 'premium', premiumExpiresAt: now - 1000 }, u2: { role: 'premium', premiumExpiresAt: now + DAY } } });
  const a = await expirePremiumIfNeeded(db, 'u1', await db.ref('users/u1').once('value').then((s) => s.val()), now);
  assert.equal(a.role, 'user');
  assert.equal(db.root.users.u1.role, 'user');
  assert.ok(db.root.users.u1.premiumExpiresAt == null);
  const b = await expirePremiumIfNeeded(db, 'u2', db.root.users.u2, now);
  assert.equal(b.role, 'premium');
});

test('email: terpakai > 7 hari dihapus, < 7 hari tetap "used", lock basi dilepas', async () => {
  const now = 2_000_000_000_000;
  const db = new FakeDb({
    emails: {
      oldUsed:   { email: 'a@x.com', authorized: true, status: 'used', usedAt: now - 7 * DAY - 1 },
      freshUsed: { email: 'b@x.com', authorized: true, status: 'used', usedAt: now - 6 * DAY },
      staleLock: { email: 'c@x.com', authorized: true, status: 'in_use', lockedBy: 'u9', lockedAt: now - LOCK_TTL_MS - 1, lockedRequestId: 'req-1' },
      freshLock: { email: 'd@x.com', authorized: true, status: 'in_use', lockedBy: 'u8', lockedAt: now - 1000 },
      free:      { email: 'e@x.com', authorized: true, status: 'available' },
    },
    usage: { u9: { 'req-1': { status: 'waiting_verification' } } },
  });
  const r = await maintainEmails(db, now);
  assert.deepEqual(r, { purged: 1, released: 1 });
  assert.equal(db.root.emails.oldUsed, undefined, 'email terpakai 7 hari dihapus');
  assert.equal(db.root.emails.freshUsed.status, 'used', 'belum 7 hari: tetap Telah Digunakan');
  assert.equal(db.root.emails.staleLock.status, 'available');
  assert.ok(db.root.emails.staleLock.lockedBy == null);
  assert.equal(db.root.emails.freshLock.status, 'in_use');
  assert.equal(db.root.emails.free.status, 'available');
  assert.equal(db.root.usage.u9['req-1'].status, 'expired');
  // idempotent
  assert.deepEqual(await maintainEmails(db, now), { purged: 0, released: 0 });
});

test('email: batas tepat 7 hari', () => {
  const now = 5_000_000_000_000;
  assert.equal(isUsedExpired({ status: 'used', usedAt: now - USED_RETENTION_MS }, now), true);
  assert.equal(isUsedExpired({ status: 'used', usedAt: now - USED_RETENTION_MS + 1 }, now), false);
  assert.equal(isUsedExpired({ status: 'used' }, now), false, 'tanpa usedAt tidak dihapus');
});
