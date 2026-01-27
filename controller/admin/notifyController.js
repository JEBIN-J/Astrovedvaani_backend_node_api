const moment = require("moment-timezone");
const AdminNotification = require("../../models/AdminNotification");
const logger = require("../../utils/logger");
const User = require("../../models/User");
const { notifyUsers } = require("../../services/notification/notifyService");

exports.sendAdminNotification = async (req, res) => {
  try {
    const { title, message, targetType, scheduled_at_ist } = req.body;
    if (!title || !message || !targetType) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const adminUserId = req.user._id;

    let type = "instant";
    let scheduledAt = null;
    if (scheduled_at_ist) {
      const dt = moment.tz(scheduled_at_ist, "DD/MM/YYYY HH:mm:ss", "Asia/Kolkata");
      if (!dt.isValid()) return res.status(400).json({ success: false, message: "Invalid date" });
      scheduledAt = dt.toDate();
      type = "scheduled";
    }

    // Determine users
    let userFilter = {};
    switch (targetType) {
      case "all":
        userFilter = {};
        break;
      case "users":
        userFilter = { role: 100 };
        break;
      case "astrologers":
        userFilter = { role: 101 };
        break;
      case "newUsers":
        userFilter = { role: 100, createdAt: { $gte: moment().subtract(7, "days").toDate() } };
        break;
      case "newAstrologers":
        userFilter = { role: 101, createdAt: { $gte: moment().subtract(7, "days").toDate() } };
        break;
      default:
        return res.status(400).json({ success: false, message: "Invalid targetType" });
    }

    // Fetch users
    const users = await User.find(userFilter).lean();

    // Save notification in DB
    const notification = await AdminNotification.create({
      title,
      message,
      type,
      role: targetType,
      scheduled_at: scheduledAt,
      created_by: adminUserId,
      sent: type === "instant",
    });

    // Send notifications in the background if instant
    if (type === "instant") {
      (async () => {
        try {
          await notifyUsers(users, title, message, { type: "ADMIN_CAMPAIGN", notificationId: notification._id });
          logger.info(`[ADMIN NOTIF] Instant notifications sent, notificationId=${notification._id}`);
        } catch (err) {
          logger.error(`[ADMIN NOTIF] Error sending instant notifications, notificationId=${notification._id}`, { error: err });
        }
      })();
    }

    return res.json({ success: true, notification, count: users.length });
  } catch (err) {
    logger.error("[ADMIN NOTIF] Error sending notification", { error: err });
    return res.status(500).json({ success: false, message: err.message });
  }
};
