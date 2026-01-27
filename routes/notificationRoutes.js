const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const notificationController = require('../controller/notificationController');

const router = express.Router();
router.get('/fetch-all', authMiddleware, notificationController.fetchMyNotifications);
router.patch('/mark-as-read', authMiddleware, notificationController.markAsRead);

module.exports = router;
