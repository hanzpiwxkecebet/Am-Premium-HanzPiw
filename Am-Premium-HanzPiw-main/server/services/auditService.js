const { getDb } = require('../config/firebase');
const { v4: uuidv4 } = require('uuid');

/**
 * Append-only audit log for admin/owner actions
 */
async function logAction({ actorUID, actorRole, action, targetUID, targetUsername, summary }) {
  const db = getDb();
  const logId = uuidv4();
  await db.ref(`adminLogs/${logId}`).set({
    actorUID: actorUID || 'system',
    actorRole: actorRole || 'system',
    action,
    targetUID: targetUID || null,
    targetUsername: targetUsername || null,
    summary: summary || '',
    createdAt: Date.now(),
  });
}

module.exports = { logAction };
