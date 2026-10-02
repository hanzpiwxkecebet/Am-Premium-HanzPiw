const express = require('express');
const router = express.Router();
const { userAuthMiddleware } = require('../middleware/userAuth');
const { getDb } = require('../firebase/config');

router.get('/stats', userAuthMiddleware, async (req, res) => {
  try {
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);
    const LIMIT = parseInt(process.env.DAILY_LIMIT || '0');

    if (!db) return res.json({ success:true, data:{ totalGenerate:0, today:0, success:0, limit:LIMIT, remaining: LIMIT || '∞' } });

    const doc = await db.collection('users').doc(req.uid).get();
    const d = doc.exists ? doc.data() : {};
    const todayCount = d.lastDate === today ? (d.dailyCount || 0) : 0;

    // Count user's successful generates
    let successCount = 0;
    try {
      const snap = await db.collection('generations')
        .where('uid', '==', req.uid)
        .where('status', '==', 'success')
        .limit(1000).get();
      successCount = snap.size;
    } catch {}

    res.json({ success:true, data:{
      totalGenerate: d.totalGenerate || 0,
      today: todayCount,
      success: successCount,
      limit: LIMIT,
      remaining: LIMIT ? Math.max(0, LIMIT - todayCount) : '∞'
    }});
  } catch (e) {
    res.status(500).json({ success:false, error: e.message });
  }
});


router.get('/history', userAuthMiddleware, async (req, res) => {
  try {
    const db = getDb();
    if (!db) return res.json({ success: true, data: [] });

    const snap = await db.collection('generations')
      .where('uid', '==', req.uid)
      .orderBy('timestamp', 'desc')
      .limit(50)
      .get();

    const history = snap.docs.map(d => {
      const data = d.data();
      return {
        id: data.id,
        maskedEmail: data.maskedEmail,
        status: data.status,
        timestamp: data.timestamp,
        requestId: data.requestId
      };
    });

    res.json({ success: true, data: history });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
