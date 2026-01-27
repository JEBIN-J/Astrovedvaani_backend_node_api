const Notification = require('../models/Notification');
const { buildPaginationResponse } = require('../utils/pagination');
const { formatNotification } = require('../utils/notificationFormatter');

exports.getUserNotifications = async (userId, page = 1, limit = 20) => {
  const skip = (page - 1) * limit;

  const [notifications, totalDocs] = await Promise.all([
    Notification.find({ recipient_id: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Notification.countDocuments({ recipient_id: userId })
  ]);

  const totalPages = Math.ceil(totalDocs / limit);

  return {
    notifications: notifications.map(formatNotification),
    pagination: buildPaginationResponse({ totalDocs, totalPages, page: Number(page), limit: Number(limit) })
  };
};

exports.markNotificationAsRead = async (userId, notificationId) => {
  const result = await Notification.findOneAndUpdate(
    { _id: notificationId, recipient_id: userId },
    { is_read: true, read_at: new Date() },
    { new: true }
  );

  if (!result) {
    throw new Error('Notification not found or not authorized');
  }

  return formatNotification(result);
};
