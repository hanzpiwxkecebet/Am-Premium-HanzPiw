const test = require('node:test');
const assert = require('node:assert/strict');
const { FakeDb, install, mockRes } = require('./helpers');

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 7)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(40, 3)]);

let tgFiles = {};
const state = install({
  axiosGet: async (url) => {
    if (url.includes('/getStickerSet')) {
      return { data: { result: { title: 'Kucing', stickers: Array.from({ length: 11 }, (_, i) => ({ file_id: 'f' + i, file_unique_id: 'u' + i, is_animated: i === 10, thumbnail: i === 10 ? { file_id: 't10', file_unique_id: 'ut10' } : undefined })) } } };
    }
    if (url.includes('/getFile')) return { data: { result: { file_path: 'stickers/x.webp' } } };
    if (url.includes('api.telegram.org/file/')) return { data: WEBP };
    if (url.startsWith('https://sticker.ly/s/')) return { data: '<title>Pack Lucu - Sticker.ly</title><img src="https://stickerly.pstatic.net/sticker_pack/AA/ZZZ111/1/id-000.png"><img src="https://stickerly.pstatic.net/sticker_pack/AA/ZZZ111/1/id-001.png">' };
    if (tgFiles[url]) return { data: tgFiles[url] };
    throw new Error('tidak diharapkan: ' + url);
  },
});
const ctrl = require('../server/controllers/chatController');
const user = (uid, role = 'user') => ({ uid, role, name: 'Nama ' + uid });
const call = async (fn, req) => { const res = mockRes(); await fn(req, res); return res; };

function seed(extra = {}) {
  state.db = new FakeDb(Object.assign({
    users: { u1: { name: 'Hanz', username: 'hanz' }, u2: { name: 'Budi', username: 'budi' }, adm: { name: 'Admin', username: 'adm' } },
  }, extra));
}

test('chat: kirim pesan menyimpan identitas dari server (bukan dari klien) + reply ringkas', async () => {
  seed();
  const a = await call(ctrl.sendMessage, { user: user('u1', 'premium'), body: { text: '  halo <b>dunia</b> @budi  ', role: 'owner', name: 'PALSU' } });
  assert.equal(a.statusCode, 200);
  const msgs = state.db.root.chat.messages;
  const [id1] = Object.keys(msgs);
  assert.equal(msgs[id1].name, 'Hanz');
  assert.equal(msgs[id1].username, 'hanz');
  assert.equal(msgs[id1].role, 'premium', 'role dari token, klien tidak bisa memalsukan');
  assert.equal(msgs[id1].text, 'halo <b>dunia</b> @budi', 'teks apa adanya (klien memakai textContent)');

  await call(ctrl.sendMessage, { user: user('u2'), body: { text: 'balasan', reply: id1 } });
  const second = Object.values(state.db.root.chat.messages).find((m) => m.uid === 'u2');
  assert.deepEqual(second.reply, { id: id1, uid: 'u1', name: 'Hanz', text: 'halo <b>dunia</b> @budi' });
});

test('chat: pesan kosong, gambar milik orang lain, dan stiker yang tidak ada ditolak', async () => {
  seed({ chatMedia: { '0123456789abcdef': { d: 'x', m: 'image/jpeg', uid: 'u2' } } });
  assert.equal((await call(ctrl.sendMessage, { user: user('u1'), body: { text: '   ' } })).statusCode, 400);
  assert.equal((await call(ctrl.sendMessage, { user: user('u1'), body: { img: '0123456789abcdef' } })).statusCode, 400, 'bukan gambar u1');
  assert.equal((await call(ctrl.sendMessage, { user: user('u2'), body: { img: '0123456789abcdef' } })).statusCode, 200);
  assert.equal((await call(ctrl.sendMessage, { user: user('u1'), body: { st: 'ffffffffffffffff' } })).statusCode, 400);
  assert.equal((await call(ctrl.sendMessage, { user: user('u1'), body: { img: '../x' } })).statusCode, 400);
});

test('chat: hapus pesan — pemilik atau staff saja; media & pin ikut bersih', async () => {
  seed({
    chat: { messages: { m1: { uid: 'u1', text: 'a', ts: 1, img: 'aaaaaaaaaaaaaaaa' }, m2: { uid: 'u1', text: 'b', ts: 2 } }, pin: { msgId: 'm1', text: 'a' } },
    chatMedia: { aaaaaaaaaaaaaaaa: { d: 'x' } },
  });
  assert.equal((await call(ctrl.deleteMessage, { user: user('u2'), params: { id: 'm2' } })).statusCode, 403);
  assert.ok(state.db.root.chat.messages.m2);
  assert.equal((await call(ctrl.deleteMessage, { user: user('adm', 'admin'), params: { id: 'm1' } })).body.success, true);
  assert.equal(state.db.root.chat.messages.m1, undefined);
  assert.equal(state.db.root.chatMedia, undefined, 'gambar ikut terhapus');
  assert.equal(state.db.root.chat.pin, undefined, 'pin ke pesan itu ikut lepas');
  assert.equal((await call(ctrl.deleteMessage, { user: user('u1'), params: { id: 'm2' } })).body.success, true, 'pemilik boleh');
});

test('chat: pin dari pesan (salin ringkas) atau teks bebas, lalu lepas', async () => {
  seed({ chat: { messages: { m1: { uid: 'u1', name: 'Hanz', role: 'owner', text: 'cpu 80% auto stop', ts: 1 } } } });
  await call(ctrl.setPin, { user: user('adm', 'admin'), body: { id: 'm1' } });
  assert.deepEqual({ ...state.db.root.chat.pin, ts: 0 }, { name: 'Hanz', role: 'owner', ts: 0, msgId: 'm1', text: 'cpu 80% auto stop' });
  assert.equal((await call(ctrl.setPin, { user: user('adm', 'admin'), body: { id: 'tidakada' } })).statusCode, 404);
  await call(ctrl.setPin, { user: user('adm', 'admin'), body: { text: 'Server maintenance jam 2' } });
  assert.equal(state.db.root.chat.pin.text, 'Server maintenance jam 2');
  assert.equal(state.db.root.chat.pin.name, 'Admin');
  await call(ctrl.clearPin, { user: user('adm', 'admin') });
  assert.equal(state.db.root.chat.pin, undefined);
});

test('chat: unggah gambar hanya JPG/PNG/WebP asli; hasilnya bisa disajikan dengan cache panjang', async () => {
  seed();
  const bad = await call(ctrl.uploadImage, { user: user('u1'), body: { data: 'data:image/png;base64,' + Buffer.from('<svg/>'.padEnd(40)).toString('base64') } });
  assert.equal(bad.statusCode, 400);
  const ok = await call(ctrl.uploadImage, { user: user('u1'), body: { data: 'data:image/jpeg;base64,' + JPEG.toString('base64') } });
  assert.equal(ok.statusCode, 200);
  const id = ok.body.data.id;
  assert.equal(state.db.root.chatMedia[id].uid, 'u1');
  const out = await call(ctrl.serveMedia, { params: { id } });
  assert.equal(out.headers['Content-Type'], 'image/jpeg');
  assert.match(out.headers['Cache-Control'], /immutable/);
  assert.deepEqual(out.body, JPEG);
  assert.equal((await call(ctrl.serveMedia, { params: { id: '../../users' } })).statusCode, 404);
});

test('chat: pesan lama dibuang otomatis beserta gambarnya (sisa 400)', async () => {
  const messages = {};
  for (let i = 0; i < 430; i++) messages['m' + String(i).padStart(4, '0')] = { uid: 'u1', text: 'x', ts: i + 1, img: i === 0 ? 'bbbbbbbbbbbbbbbb' : undefined };
  seed({ chat: { messages }, chatMedia: { bbbbbbbbbbbbbbbb: { d: 'x' } } });
  const orig = Math.random; Math.random = () => 0;
  try { await call(ctrl.sendMessage, { user: user('u1'), body: { text: 'baru' } }); await new Promise((r) => setTimeout(r, 20)); }
  finally { Math.random = orig; }
  const left = Object.keys(state.db.root.chat.messages).length;
  assert.equal(left, 400);
  assert.equal(state.db.root.chat.messages.m0000, undefined);
  assert.equal(state.db.root.chatMedia, undefined);
});

test('chat: impor stiker Telegram bertahap, animasi pakai pratinjau, duplikat dilewati, tanpa token ditolak', async () => {
  seed();
  delete process.env.TELEGRAM_BOT_TOKEN;
  assert.equal((await call(ctrl.importStickers, { user: user('o', 'owner'), body: { link: 'https://t.me/addstickers/Kucing' } })).statusCode, 400);
  process.env.TELEGRAM_BOT_TOKEN = '123:abc';

  const r1 = await call(ctrl.importStickers, { user: user('o', 'owner'), body: { link: 'https://t.me/addstickers/Kucing', offset: 0 } });
  assert.equal(r1.body.data.added, 8);
  assert.equal(r1.body.data.total, 11);
  assert.equal(r1.body.data.next, 8);
  assert.equal(r1.body.data.done, false);
  const r2 = await call(ctrl.importStickers, { user: user('o', 'owner'), body: { link: 'https://t.me/addstickers/Kucing', offset: 8 } });
  assert.equal(r2.body.data.added, 3, 'termasuk stiker animasi lewat pratinjau statis');
  assert.equal(r2.body.data.done, true);
  const stickers = Object.values(state.db.root.chat.stickers);
  assert.equal(stickers.length, 11);
  assert.equal(stickers[0].pack, 'Kucing');
  assert.equal(stickers[0].m, 'image/webp');
  assert.ok(Object.keys(state.db.root.chatSticker).length === 11);

  const again = await call(ctrl.importStickers, { user: user('o', 'owner'), body: { link: 'https://t.me/addstickers/Kucing', offset: 0 } });
  assert.equal(again.body.data.added, 0, 'impor ulang tidak menggandakan');
  assert.equal(again.body.data.skipped, 8);
  delete process.env.TELEGRAM_BOT_TOKEN;
});

test('chat: impor sticker.ly dan link gambar langsung; URL internal ditolak; hapus stiker & pack', async () => {
  seed();
  const sly = await call(ctrl.importStickers, { user: user('o', 'owner'), body: { link: 'https://sticker.ly/s/ZZZ111' } });
  assert.equal(sly.statusCode, 200);
  assert.equal(sly.body.data.pack, 'Pack Lucu');
  assert.equal(sly.body.data.total, 2);
  // gambar sticker.ly tidak ada isinya di mock -> dilewati, bukan error
  assert.equal(sly.body.data.added, 0);

  tgFiles['https://cdn.example.com/a.webp'] = WEBP;
  const direct = await call(ctrl.importStickers, { user: user('o', 'owner'), body: { urls: ['https://cdn.example.com/a.webp', 'http://127.0.0.1/x.png', 'https://10.0.0.1/y.png'], pack: 'Punyaku' } });
  assert.equal(direct.body.data.added, 1);
  assert.equal(direct.body.data.total, 1, 'URL internal sudah disaring sebelum diunduh');
  const [id] = Object.keys(state.db.root.chat.stickers);
  assert.equal(state.db.root.chat.stickers[id].pack, 'Punyaku');

  assert.equal((await call(ctrl.importStickers, { user: user('o', 'owner'), body: { link: 'https://evil.com/halaman' } })).statusCode, 400);

  const stk = await call(ctrl.serveSticker, { params: { id } });
  assert.equal(stk.headers['Content-Type'], 'image/webp');
  await call(ctrl.deletePack, { params: { pack: 'Punyaku' } });
  assert.equal(state.db.root.chat, undefined);
  assert.equal(state.db.root.chatSticker, undefined);
});

test('chat: state (cadangan polling) memberi pesan baru, pin, stiker, dan hitungan online', async () => {
  const now = Date.now();
  seed({
    chat: {
      messages: { m1: { uid: 'u1', text: 'lama', ts: now - 5000 }, m2: { uid: 'u2', text: 'baru', ts: now - 1000 } },
      pin: { text: 'p' }, stickers: { aaaaaaaaaaaaaaaa: { pack: 'P', m: 'image/png', ts: 1 } },
      presence: { u2: { name: 'Budi', ts: now - 10000 }, u3: { name: 'Lama', ts: now - 3600000 } },
    },
  });
  const res = await call(ctrl.getState, { user: user('u1'), query: { ping: '1', since: '0' } });
  assert.equal(res.body.data.messages.length, 2);
  assert.equal(res.body.data.pin.text, 'p');
  assert.ok(res.body.data.stickers.aaaaaaaaaaaaaaaa);
  assert.equal(res.body.data.online, 2, 'u1 baru ping + u2 aktif; u3 sudah lama');
});
