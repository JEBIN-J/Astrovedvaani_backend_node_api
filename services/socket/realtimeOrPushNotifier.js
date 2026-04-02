const logger = require("../../utils/logger");
const sendPushNotification = require("../notification/sendNotification");

let socketManagerRef = null;

function registerSocketManager(socketManager) {
  socketManagerRef = socketManager;
  logger.info(
    `[Notifier] SocketManager registered | hasIO=${!!socketManager?.io}`
  );
}

async function notifyUserHybrid({
  userId,
  event,
  title,
  message,
  payload = {},
  channelId = "general"
}) {
  try {
    const key = userId?.toString();
    logger.info(`[Notifier] Incoming | user=${key}, event=${event}, channel=${channelId}`);
    if (!socketManagerRef) {
      logger.warn(`[Notifier] No socketManager → PUSH fallback | user=${key}`);
      await sendPushNotification(key, title, message, {
        ...payload,
        channelId
      });
      return { deliveredVia: "push" };
    }
    const userSockets = socketManagerRef.userSockets.get(key);
    logger.info(
      `[Notifier] Socket lookup | user=${key}, sockets=${
        userSockets ? userSockets.size : 0
      }`
    );
    if (userSockets && userSockets.size > 0) {
      socketManagerRef.io.to(`user_${key}`).emit(event, payload);
      logger.info(
        `[Notifier] Delivered via SOCKET | user=${key}, event=${event}`
      );
      return { deliveredVia: "socket" };
    }
    logger.info(
      `[Notifier] Offline → PUSH | user=${key}, channel=${channelId}`
    );
    await sendPushNotification(key, title, message, {
      ...payload,
      channelId
    });
    logger.info(
      `[Notifier] Delivered via PUSH | user=${key}`
    );
    return { deliveredVia: "push" };
  } catch (err) {
    logger.error(
      `[Notifier] Failed | user=${userId}, error=${err.message}`,
      { stack: err.stack }
    );
  }
}

module.exports = {
  registerSocketManager,
  notifyUserHybrid
};