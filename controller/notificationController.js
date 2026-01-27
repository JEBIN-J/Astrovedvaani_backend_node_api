const notificationService = require('../services/notificationService');

exports.fetchMyNotifications = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page = 1, limit = 20 } = req.query;

    const { notifications, pagination } = await notificationService.getUserNotifications(userId, page, limit);

    res.json({
      success: true,
      data: notifications,
      pagination
    });
  } catch (err) {
    console.error('[NotificationController] Fetch Error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const userId = req.user._id;
    const { notificationId } = req.query;

    const updated = await notificationService.markNotificationAsRead(userId, notificationId);
    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('[NotificationController] Mark-as-read error:', err);
    res.status(400).json({ success: false, message: err.message || 'Failed to update notification' });
  }
};
