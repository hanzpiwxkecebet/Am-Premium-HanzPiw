const express = require('express');
const router = express.Router();
const { verifyToken, requireMinRole } = require('../middleware/auth');
const ctrl = require('../controllers/adminController');

const isAdmin = [verifyToken, requireMinRole('admin')];
const isModerator = [verifyToken, requireMinRole('moderator')];
const isOwner = [verifyToken, requireMinRole('owner')];

// Stats
router.get('/stats', ...isAdmin, ctrl.getAdminStats);
router.get('/logs', ...isAdmin, ctrl.getAdminLogs);

// User management
router.get('/users', ...isModerator, ctrl.getUsers);
router.get('/users/:uid', ...isModerator, ctrl.getUserDetail);
router.patch('/users/:uid/role', ...isAdmin, ctrl.updateUserRole);
router.patch('/users/:uid/limit', ...isAdmin, ctrl.updateUserLimit);
router.patch('/users/:uid/suspend', ...isAdmin, ctrl.suspendUser);
router.patch('/users/:uid/activate', ...isAdmin, ctrl.activateUser);

// Redeem management
router.get('/redeem', ...isAdmin, ctrl.getRedeemCodes);
router.post('/redeem', ...isAdmin, ctrl.createRedeemCode);
router.delete('/redeem/:id', ...isAdmin, ctrl.deleteRedeemCode);
router.patch('/redeem/:id', ...isAdmin, ctrl.updateRedeemCode);

// Email management
router.get('/emails', ...isAdmin, ctrl.getEmails);
router.post('/emails', ...isAdmin, ctrl.addEmail);
router.delete('/emails/:id', ...isAdmin, ctrl.deleteEmail);
router.patch('/emails/:id', ...isAdmin, ctrl.updateEmailStatus);

// Announcements
router.get('/announcements', ...isModerator, ctrl.getAnnouncements);
router.post('/announcements', ...isAdmin, ctrl.createAnnouncement);
router.patch('/announcements/:id', ...isAdmin, ctrl.updateAnnouncement);
router.delete('/announcements/:id', ...isAdmin, ctrl.deleteAnnouncement);

// System settings
router.get('/system', ...isAdmin, ctrl.getSystemSettings);
router.patch('/system', ...isAdmin, ctrl.updateSystemSettings);

module.exports = router;
