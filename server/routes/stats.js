const express = require('express');
const router = express.Router();
const { getStats } = require('../services/firebaseService');
const { getAnnouncements } = require('../services/firebaseService');
const { checkApiStatus } = require('../services/apiService');

// Public stats endpoint
router.get('/', async (req, res) => {
  try {
    const [stats, apiStatus] = await Promise.all([getStats(), checkApiStatus()]);
    res.json({
      success: true,
      data: {
        total: stats.total || 0,
        success: stats.success || 0,
        failed: stats.failed || 0,
        today: ( stats.daily || {} )[new Date().toISOString().slice(0,10)] || 0,
        apiOnline: apiStatus.online
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
});

// Announcements endpoint
router.get('/announcements', async (req, res) => {
  try {
    const announcements = await getAnnouncements();
    res.json({ success: true, data: announcements });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to fetch announcements' });
  }
});

module.exports = router;
