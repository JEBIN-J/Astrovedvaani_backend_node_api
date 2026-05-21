const admin = require("../../utils/firebase");
const User = require("../../models/User");
const logger = require("../../utils/logger");

const RESERVED_KEYS = [
  "from",
  "to",
  "message_id",
  "collapse_key",
  "message_type",
  "ttl",
  "priority",
];
async function sendPushNotification(userId, title, body, data = {}, channelId = "messages", sound = "ding.mp3") {
  logger.info(`[NOTIF] Sending push notification to userId: ${userId}`);
  const user = await User.findById(userId);
  if (!user) {
    logger.warn(`[NOTIF] User not found for userId: ${userId}`);
    return false;
  }
  const token = user.fcmToken;
  if (!token) {
    logger.warn(`[NOTIF] No FCM token found for user: ${user.name}`);
    return false;
  }
  const sanitizedData = Object.fromEntries(
    Object.entries(data).map(([k, v]) => {
      const safeKey = RESERVED_KEYS.includes(k) ? `_${k}` : k;
      return [String(safeKey), String(v)];
    }),
  );
  const message = {
    token,
    notification: { title, body },
    data: sanitizedData,
    android: {
      priority: "high",
      notification: {
        channelId,
        sound,
      },
    },
  };

  try {
    const messaging = admin.messaging();
    const response = await messaging.send(message);
    logger.info(
      `[NOTIF] Notification sent to user ${user.name}: success response :${response}`,
    );
    return true;
  } catch (err) {
    logger.error(
      `[NOTIF] Error sending notification to user ${userId}: ${err.message}`,
      { stack: err.stack },
    );
    if (err.code === "messaging/registration-token-not-registered") {
      user.fcmToken = null;
      await user.save();
      logger.info(`[NOTIF] Cleared invalid FCM token for user: ${user.name}`);
    }
    return false;
  }
}
module.exports = sendPushNotification;
