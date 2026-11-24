const express = require('express');
const router = express.Router();
const { verifyToken, requireMinRole } = require('../middleware/auth');
const { dbRateLimit } = require('../middleware/dbRateLimit');
const { chatReadLimiter } = require('../middleware/rateLimiter');
const ctrl = require('../controllers/chatController');

const uid = (req) => req.user.uid;
const sendLimit = dbRateLimit({ name: 'chat-send', windowMs: 20 * 1000, max: 8, key: uid, message: 'Pelan-pelan, kamu mengirim terlalu cepat.' });
const uploadLimit = dbRateLimit({ name: 'chat-up', windowMs: 2 * 60 * 1000, max: 6, key: uid, message: 'Terlalu banyak unggah gambar. Coba lagi sebentar.' });
const staff = [verifyToken, requireMinRole('moderator')];
const owner = [verifyToken, requireMinRole('owner')];

// Media publik (id acak, tidak bisa ditebak) — dipakai <img>/<video> yang tidak bisa mengirim token
router.get('/media/:id', ctrl.serveMedia);
router.get('/sticker/:id', ctrl.serveSticker);

router.get('/state', verifyToken, chatReadLimiter, ctrl.getState);
router.get('/avatars', verifyToken, chatReadLimiter, ctrl.getAvatars);
router.post('/send', verifyToken, sendLimit, ctrl.sendMessage);
router.post('/upload', verifyToken, uploadLimit, ctrl.uploadImage);
router.delete('/message/:id', verifyToken, ctrl.deleteMessage);

router.post('/pin', ...staff, ctrl.setPin);
router.delete('/pin', ...staff, ctrl.clearPin);

router.get('/stickers', ...owner, ctrl.listStickers);
router.post('/stickers/import', ...owner, ctrl.importStickers);
router.delete('/stickers/pack/:pack', ...owner, ctrl.deletePack);
router.delete('/stickers/:id', ...owner, ctrl.deleteSticker);

module.exports = router;
