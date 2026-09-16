const express = require('express');
const router = express.Router();
const { adminAuthMiddleware } = require('../middleware/auth');
const {
  getOverview, getHistory, getConfig, setMaintenance, updateConfig, broadcast, getLogsHandler
} = require('../controllers/adminController');

// All admin routes require auth
router.use(adminAuthMiddleware);

router.get('/overview', getOverview);
router.get('/history', getHistory);
router.get('/config', getConfig);
router.post('/maintenance', setMaintenance);
router.post('/config', updateConfig);
router.post('/broadcast', broadcast);
router.get('/logs', getLogsHandler);

// Health check (still requires auth)
router.get('/ping', (req, res) => res.json({ success: true, message: 'Admin OK', ts: Date.now() }));

module.exports = router;
