const Enums = require("../../utils/constants");
const logger = require("../../utils/logger");
const { setInSession } = require("../../utils/redis/sessionExtend");
const sendMissedMessages = require("./sendMissedMessages");

module.exports = async function registerRejoinService(socketManager, socket) {
  const { userId, role } = socket.user;
  logger.info(`[REJOIN] Checking auto-rejoin for user ${userId}`);
  try {
    const active = socketManager.getActiveSession(userId);
    if (!active) return;
    const sessionId = active.sessionId;
    const { getSession, getUser } = require("../../utils/redis/sessionCacheService");
    const session = await getSession(sessionId);
    if (!session || session.status !== Enums.SERVICE.STATUS.ONGOING) return;
    const now = new Date();
    if (new Date(session.end_time) <= now) return;
    const disconnectKey = `${sessionId}_${userId}`;
    if (socketManager.disconnectTimeouts.has(disconnectKey)) {
      clearTimeout(socketManager.disconnectTimeouts.get(disconnectKey));
      socketManager.disconnectTimeouts.delete(disconnectKey);
    }
    await setInSession(sessionId, userId, true);
    socket.join(`session_${sessionId}`);
    const remainingSeconds = Math.max(
      Math.floor((new Date(session.end_time) - now) / 1000),
      0
    );
    const astrologer = await getUser(session.astrologer_user_id);
    const reqUser = await getUser(session.user_id);
    let payload;
    if (role === Enums.USER.ROLE.USER) {
      payload = {
        astrologerId: session.astrologer_user_id,
        astrologer_id: session.astrologer_id,
        name: astrologer?.name || "",
        profilePicture: astrologer?.profilePicture || "",
        sessionId: session._id,
        chatId: session.chat_id,
        duration: session.duration_minutes,
        ratePerMinute: session.rate_per_minute,
        totalAmount: session.total_amount,
        startTime: session.start_time,
        remainingSeconds,
        resumed: true,
        timestamp: Date.now(),
        message: "Session resumed automatically",
        mode: session.mode,
      };
      if (session.agora) {
        payload.agora = {
          channelName: session.agora.channelName,
          astroUid: session.agora.astroUid,
          userUid: session.agora.userUid,
          astroToken: session.agora.astroToken,
          userToken: session.agora.userToken,
          mode: session.agora.mode,
        };
      }
    } else {
      const totalSeconds = session.duration_minutes * 60;
      const usedSeconds = Math.max(totalSeconds - remainingSeconds, 0);/// 100 sec -30 sec
      payload = {
        astrologerId: session.astrologer_user_id,
        from: session.user_id,
        name: reqUser?.name || "",
        profilePicture: reqUser?.profilePicture || "",
        astrologer_id: session.astrologer_id,
        sessionId: session._id,
        chatId: session.chat_id,
        duration: session.duration_minutes,
        ratePerMinute: session.rate_per_minute,
        totalAmount: session.total_amount,
        startTime: session.start_time,
        remainingSeconds,
        usedSeconds,
        resumed: true,
        timestamp: Date.now(),
        message: "Session resumed automatically",
        mode:session.mode,
      };
      if (session.agora) {
        payload.agora = {
          channelName: session.agora.channelName,
          astroUid: session.agora.astroUid,
          userUid: session.agora.userUid,
          astroToken: session.agora.astroToken,
          userToken: session.agora.userToken,
          mode: session.agora.mode,
        };
      }
    }
    socket.emit("session_resume", payload);
    await sendMissedMessages(socket, userId, sessionId);
    logger.info(`[REJOIN] Auto-resumed session ${sessionId} for user ${userId}`);
  } catch (err) {
    logger.error("[REJOIN] Auto-rejoin failed:", err);
  }
};