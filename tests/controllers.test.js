const test = require('node:test');
const assert = require('node:assert/strict');
const { FakeDb, install, mockRes } = require('./helpers');

const state = install();
const { redeemCode } = require('../server/controllers/redeemController');
const { sendVerify, submitVerify } = require('../server/controllers/generatorController');
const { dbRateLimit } = require('../server/middleware/dbRateLimit');

const reqOf = (uid, body, headers = {}) => ({ user: { uid, role: 'user' }, body, headers });

test('redeem: request paralel dari user yang sama hanya berhasil sekali', async () => {
  state.db = new FakeDb({
    users: { u1: { role: 'user', dailyLimit: 20 } },
    redeem: { ABCD1234: { type: 'limit', value: 5, active: true, usedCount: 0, maxUses: 10 } },
  });
  const [a, b] = [mockRes(), mockRes()];
  await Promise.all([redeemCode(reqOf('u1', { code: 'abcd1234' }), a), redeemCode(reqOf('u1', { code: 'ABCD1234' }), b)]);
  const codes = [a.statusCode, b.statusCode].sort();
  assert.deepEqual(codes, [200, 409]);
  assert.equal(state.db.root.users.u1.dailyLimit, 25, 'limit hanya bertambah sekali');
  assert.equal(state.db.root.redeem.ABCD1234.usedCount, 1);
});

test('redeem: kode tidak valid melepas klaim (user boleh coba kode lain/ulang)', async () => {
  state.db = new FakeDb({ users: { u1: { role: 'user' } }, redeem: { OFFCODE1: { type: 'limit', value: 5, active: false } } });
  const res = mockRes();
  await redeemCode(reqOf('u1', { code: 'OFFCODE1' }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(state.db.root.users.u1.redeemedCodes, undefined);
});

test('redeem: premium diperpanjang dari sisa masa & role staff tidak diturunkan', async () => {
  const future = Date.now() + 10 * 86400000;
  state.db = new FakeDb({
    users: { u1: { role: 'premium', premiumExpiresAt: future }, adm: { role: 'admin' } },
    redeem: { PREM30AA: { type: 'premium', value: 30, active: true, usedCount: 0 } },
  });
  const r1 = mockRes(); await redeemCode(reqOf('u1', { code: 'PREM30AA' }), r1);
  assert.equal(r1.statusCode, 200);
  assert.equal(state.db.root.users.u1.premiumExpiresAt, future + 30 * 86400000);
  const r2 = mockRes(); await redeemCode({ user: { uid: 'adm', role: 'admin' }, body: { code: 'PREM30AA' }, headers: {} }, r2);
  assert.equal(state.db.root.users.adm.role, 'admin');
});

test('submitVerify: tap ganda hanya memanggil API sekali', async () => {
  state.axiosCalls.length = 0;
  state.db = new FakeDb({
    users: { u1: { role: 'user' } },
    usage: { u1: { 'req-12345678': { status: 'waiting_verification', method: 'custom', email_masked: 'jo***@x.com' } } },
  });
  const body = { email: 'john@x.com', link: 'https://x/y?oobCode=1', requestId: 'req-12345678' };
  const [a, b] = [mockRes(), mockRes()];
  await Promise.all([submitVerify(reqOf('u1', body), a), submitVerify(reqOf('u1', body), b)]);
  assert.deepEqual([a.statusCode, b.statusCode].sort(), [200, 409]);
  assert.equal(state.axiosCalls.length, 1);
  assert.equal(state.db.root.usage.u1['req-12345678'].status, 'completed');
});

test('submitVerify: email berbeda dari yang dikirimi verifikasi ditolak & bisa dicoba lagi', async () => {
  state.db = new FakeDb({ usage: { u1: { 'req-abcdefgh': { status: 'waiting_verification', method: 'custom', email_masked: 'jo***@x.com' } } } });
  const res = mockRes();
  await submitVerify(reqOf('u1', { email: 'other@y.com', link: 'https://x', requestId: 'req-abcdefgh' }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(state.db.root.usage.u1['req-abcdefgh'].status, 'waiting_verification');
});

test('sendVerify: email sistem terkunci atomik & berhasil dipakai sekali; /send ganda ditolak', async () => {
  state.db = new FakeDb({
    users: { u1: { role: 'user', dailyLimit: 5, usedToday: 0, lastResetDate: '' }, u2: { role: 'user', dailyLimit: 5 } },
    emails: { e1: { email: 'sys@x.com', authorized: true, status: 'available' } },
  });
  const [a, b] = [mockRes(), mockRes()];
  await Promise.all([
    sendVerify(reqOf('u1', { email: 'sys@x.com', method: 'system' }, { 'x-request-id': 'req-aaaaaaaa' }), a),
    sendVerify(reqOf('u2', { email: 'sys@x.com', method: 'system' }, { 'x-request-id': 'req-bbbbbbbb' }), b),
  ]);
  assert.deepEqual([a.statusCode, b.statusCode].sort(), [200, 409]);
  assert.equal(state.db.root.emails.e1.status, 'in_use');
  assert.ok(state.db.root.emails.e1.lockedRequestId);
  assert.equal(state.db.root.pendingRequests, undefined, 'penanda in-flight dilepas');
});

test('sendVerify: request kedua saat yang pertama masih jalan ditolak (429)', async () => {
  state.db = new FakeDb({ users: { u1: { role: 'user', dailyLimit: 5 } }, pendingRequests: { u1: { t: Date.now() } } });
  const res = mockRes();
  await sendVerify(reqOf('u1', { email: 'a@b.com', method: 'custom' }), res);
  assert.equal(res.statusCode, 429);
});

test('dbRateLimit: lewat batas -> 429, jendela baru -> lolos lagi', async () => {
  state.db = new FakeDb();
  const lim = dbRateLimit({ name: 't', windowMs: 60000, max: 2, key: () => 'k' });
  let passed = 0;
  const run = async () => { const res = mockRes(); await lim({}, res, () => { passed++; }); return res; };
  await run(); await run();
  const blocked = await run();
  assert.equal(passed, 2);
  assert.equal(blocked.statusCode, 429);
  assert.ok(blocked.headers['Retry-After']);
  // majukan jendela
  const k = Object.keys(state.db.root.rateLimits)[0];
  state.db.root.rateLimits[k].resetAt = Date.now() - 1;
  await run();
  assert.equal(passed, 3);
});
