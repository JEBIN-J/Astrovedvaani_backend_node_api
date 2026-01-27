module.exports.formatNotification = (notification) => ({
  id: notification._id,
  title: notification.title,
  message: notification.message,
  type: notification.type,
  is_read: notification.is_read,
  read_at: notification.read_at,
  created_at: notification.createdAt,
  related_entity: notification.related_entity,
});