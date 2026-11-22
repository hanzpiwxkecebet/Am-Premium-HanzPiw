const express = require('express');
const router = express.Router();
const { verifyToken, requireMinRole } = require('../middleware/auth');
const ctrl = require('../controllers/adminController');

const isAdmin = [verifyToken, requireMinRole('admin')];
const isModerator = [verifyToken, requireMinRole('moderator')];
const isOwner = [verifyToken, requireMinRole('owner')];

// Frontend memakai PUT/POST, route lama hanya PATCH. Terima semuanya.
const update = (path, ...handlers) => {
  router.put(path, ...handlers);
  router.patch(path, ...handlers);
  router.post(path, ...handlers);
};

// Stats
router.get('/stats', ...isAdmin, ctrl.getAdminStats);
router.get('/logs', ...isAdmin, ctrl.getAdminLogs);

// User management
router.get('/users', ...isModerator, ctrl.getUsers);
router.get('/users/:uid', ...isModerator, ctrl.getUserDetail);
update('/users/:uid/role', ...isAdmin, ctrl.updateUserRole);
update('/users/:uid/limit', ...isAdmin, ctrl.updateUserLimit);
update('/users/:uid/suspend', ...isAdmin, ctrl.suspendUser);
update('/users/:uid/activate', ...isAdmin, ctrl.activateUser);

// Redeem management
router.get('/redeem', ...isAdmin, ctrl.getRedeemCodes);
router.post('/redeem', ...isAdmin, ctrl.createRedeemCode);
router.delete('/redeem/:id', ...isAdmin, ctrl.deleteRedeemCode);
update('/redeem/:id', ...isAdmin, ctrl.updateRedeemCode);

// Email management
router.get('/emails', ...isAdmin, ctrl.getEmails);
router.post('/emails', ...isAdmin, ctrl.addEmail);
router.delete('/emails/:id', ...isAdmin, ctrl.deleteEmail);
update('/emails/:id', ...isAdmin, ctrl.updateEmailStatus);

// Announcements
router.get('/announcements', ...isModerator, ctrl.getAnnouncements);
router.post('/announcements', ...isAdmin, ctrl.createAnnouncement);
update('/announcements/:id', ...isAdmin, ctrl.updateAnnouncement);
router.delete('/announcements/:id', ...isAdmin, ctrl.deleteAnnouncement);

// System settings
router.get('/system', ...isAdmin, ctrl.getSystemSettings);
update('/system', ...isAdmin, ctrl.updateSystemSettings);

// Danger zone (owner)
router.post('/background', ...isOwner, ctrl.uploadBackground);
router.delete('/background', ...isOwner, ctrl.deleteBackground);
router.post('/system/reset-stats', ...isOwner, ctrl.resetGlobalStats);
router.post('/system/reset-limits', ...isOwner, ctrl.resetAllLimits);
router.post('/system/apply-default-limit', ...isOwner, ctrl.applyDefaultLimit);

module.exports = router;
