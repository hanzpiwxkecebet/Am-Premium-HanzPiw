const express = require('express');
const router = express.Router();
const { userAuthMiddleware } = require('../middleware/userAuth');
const { getUserStats } = require('../services/firebaseService');

// Get current user stats (daily limit info)
router.get('/stats', userAuthMiddleware, async (req, res) => {
  try {
    const stats = await getUserStats(req.uid);
    res.json({ success: true, data: stats });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
