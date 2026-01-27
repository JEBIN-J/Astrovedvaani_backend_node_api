const Enums = require("../../utils/constants");
const logger = require("../../utils/logger");
const {
  getSession,
  getUser,
} = require("../../utils/redis/sessionCacheService");
const { getInSession } = require("../../utils/redis/sessionExtend");
const sendPushNotification = require("../notification/sendNotification");

module.exports = function scheduleDisconnectPush(
  socketManager,
  userId,
  sessionId,
  role,
) {
  const key = `${sessionId}_${userId}`;
  if (socketManager.pushNotifyTimeouts.has(key)) return;

  const timer = setTimeout(async () => {
    try {
      const session = await getSession(sessionId);
      if (!session || session.status !== Enums.SERVICE.STATUS.ONGOING) return;

      const stillOut = !(await getInSession(sessionId, userId));
      if (!stillOut) {
        logger.info(`[PUSH] User rejoined, skip disconnect push`);
        return;
      }

      // Identify who should receive push
      const targetUserId =
        userId.toString() === session.user_id.toString()
          ? session.user_id
          : session.astrologer_user_id;

      // Identify opposite participant (payload.from)
      const fromUserId =
        targetUserId.toString() === session.user_id.toString()
          ? session.astrologer_user_id
          : session.user_id;

      const fromUser = await getUser(fromUserId);

      const mode = session.mode || Enums.SERVICE.TYPE.CHAT;

      const serviceLabels = {
        [Enums.SERVICE.TYPE.CHAT]: "Chat",
        [Enums.SERVICE.TYPE.VIDEO]: "Video Call",
        [Enums.SERVICE.TYPE.CALL]: "Audio Call",
      };

      const serviceName = serviceLabels[mode] || "Session";

      // 🔥 CONSISTENT PAYLOAD (same as chat / agora)
      const payload = {
        from: fromUserId,
        name: fromUser?.name || "",
        profilePicture: fromUser?.profilePicture || "",
        sessionId: session._id,
        chatId: session.chat_id,
        duration: session.duration_minutes,
        ratePerMinute: session.rate_per_minute,
        totalAmount: session.total_amount,
        mode,
        channelId: mode,
        message: `You were disconnected from an ongoing ${serviceName}. Rejoin before it ends.`,
        timestamp: Date.now(),
        resumed: false,
        type: "SESSION_REJOIN",
      };

      await sendPushNotification(
        targetUserId,
        `${serviceName} Session Ongoing`,
        payload.message,
        payload,
      );

      logger.info(
        `[PUSH] Disconnect reminder sent | user=${targetUserId} | session=${sessionId}`,
      );
    } catch (err) {
      logger.error(`[PUSH] Disconnect push failed`, err);
    } finally {
      socketManager.pushNotifyTimeouts.delete(key);
    }
  }, 1000); // ✅ 3s grace period

  socketManager.pushNotifyTimeouts.set(key, timer);
};
