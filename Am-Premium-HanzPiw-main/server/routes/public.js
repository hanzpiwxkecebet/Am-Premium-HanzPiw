const express = require('express');
const router = express.Router();
const { getDb } = require('../config/firebase');

// Public announcements (active only)
router.get('/announcements', async (req, res) => {
  const db = getDb();
  const snap = await db.ref('announcements').orderByChild('active').equalTo(true).once('value');
  const items = [];
  snap.forEach(child => {
    const v = child.val();
    if (v.active) items.push({ id: child.key, title: v.title, content: v.content, priority: v.priority, createdAt: v.createdAt });
  });
  items.sort((a, b) => (b.priority || 0) - (a.priority || 0) || (b.createdAt || 0) - (a.createdAt || 0));
  return res.json({ success: true, data: items });
});

// System status (maintenance, version)
router.get('/status', async (req, res) => {
  const db = getDb();
  const snap = await db.ref('system').once('value');
  const sys = snap.val() || {};
  return res.json({
    success: true,
    data: {
      maintenance: sys.maintenance === true,
      maintenanceMessage: sys.maintenanceMessage || '',
      appVersion: sys.appVersion || process.env.APP_VERSION || '2.0.0-beta',
      apiStatus: sys.apiStatus || 'unknown',
    }
  });
});

module.exports = router;
