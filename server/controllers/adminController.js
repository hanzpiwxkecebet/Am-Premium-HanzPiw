const {
  getStats, getGenerations, getSettings, updateSettings,
  getAnnouncements, createAnnouncement, getLogs, writeLog
} = require('../services/firebaseService');
const { checkApiStatus } = require('../services/apiService');

async function getOverview(req, res) {
  try {
    const [stats, apiStatus] = await Promise.all([getStats(), checkApiStatus()]);
    res.json({ success: true, data: { stats, apiStatus } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
}

async function getHistory(req, res) {
  try {
    const limit = Math.min(parseInt(req.query.limit || '50'), 200);
    const generations = await getGenerations(limit);
    res.json({ success: true, data: generations });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
}

async function getConfig(req, res) {
  try {
    const settings = await getSettings();
    // Don't expose sensitive settings
    const safe = {
      maintenance: settings.maintenance || false,
      cooldown: settings.cooldown || 30,
      apiBaseUrl: settings.apiBaseUrl || process.env.API_BASE_URL,
      rateLimit: { max: settings.rateLimitMax || 10 }
    };
    res.json({ success: true, data: safe });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
}

async function setMaintenance(req, res) {
  try {
    const { enabled } = req.body;
    await updateSettings({ maintenance: !!enabled });
    await writeLog('info', `Maintenance mode ${enabled ? 'enabled' : 'disabled'}`, {});
    res.json({ success: true, message: `Maintenance mode ${enabled ? 'diaktifkan' : 'dinonaktifkan'}` });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
}

async function updateConfig(req, res) {
  try {
    const allowed = ['cooldown', 'rateLimitMax', 'apiBaseUrl'];
    const data = {};
    allowed.forEach(key => { if (req.body[key] !== undefined) data[key] = req.body[key]; });
    await updateSettings(data);
    res.json({ success: true, message: 'Konfigurasi berhasil diperbarui.' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
}

async function broadcast(req, res) {
  try {
    const { title, description, link, type = 'banner' } = req.body;
    if (!title) return res.status(400).json({ success: false, error: 'Title diperlukan.' });
    await createAnnouncement({ title, description, link, type });
    res.json({ success: true, message: 'Announcement berhasil dibuat.' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
}

async function getLogsHandler(req, res) {
  try {
    const limit = Math.min(parseInt(req.query.limit || '100'), 500);
    const logs = await getLogs(limit);
    res.json({ success: true, data: logs });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
}

module.exports = { getOverview, getHistory, getConfig, setMaintenance, updateConfig, broadcast, getLogsHandler };
