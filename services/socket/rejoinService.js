const Enums = require("../../utils/constants");
const logger = require("../../utils/logger");
const { setInSession } = require("../../utils/redis/sessionExtend");
const sendMissedMessages = require("./sendMissedMessages");
const ConsultationSession = require("../../models/ConsultationSession");

const { getUserById } = require("../session/userService");

const THRESHOLD_MS = 30 * 1000;

module.exports = async function registerRejoinService(socketManager, socket) {
  const {
  saveUser,
  getUser,
  getSession,
} = require("../../utils/redis/sessionCacheService");
  const { userId, role } = socket.user;

  logger.info(`[REJOIN] Checking auto-rejoin for user ${userId}`);

  try {
    // =========================================================
    // ✅ CASE 1: ACTIVE SESSION EXISTS → RESUME SESSION
    // =========================================================

    const active = socketManager.getActiveSession(userId);

    if (active) {
      const sessionId = active.sessionId;

      const session = await getSession(sessionId);

      logger.info(
        `[REJOIN] Active session lookup for user ${userId}, session ${sessionId}`
      );

      if (
        session &&
        session.status === Enums.SERVICE.STATUS.ONGOING
      ) {
        const now = new Date();

        if (new Date(session.end_time) > now) {
          const disconnectKey = `${sessionId}_${userId}`;

          if (socketManager.disconnectTimeouts.has(disconnectKey)) {
            clearTimeout(
              socketManager.disconnectTimeouts.get(disconnectKey)
            );

            socketManager.disconnectTimeouts.delete(disconnectKey);

            logger.info(
              `[REJOIN] Cleared disconnect timeout ${disconnectKey}`
            );
          }

          await setInSession(sessionId, userId, true);

          socket.join(`session_${sessionId}`);

          const remainingSeconds = Math.max(
            Math.floor(
              (new Date(session.end_time) - now) / 1000
            ),
            0
          );

          const astrologer = await getUser(
            session.astrologer_user_id
          );

          const reqUser = await getUser(session.user_id);

          let payload;

          // =========================================================
          // USER PAYLOAD
          // =========================================================

          if (role === Enums.USER.ROLE.USER) {
            payload = {
              astrologerId: session.astrologer_user_id,
              astrologer_id: session.astrologer_id,

              name: astrologer?.name || "",
              profilePicture:
                astrologer?.profilePicture || "",

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
          }

          // =========================================================
          // ASTROLOGER PAYLOAD
          // =========================================================

          else {
            const totalSeconds =
              session.duration_minutes * 60;

            const usedSeconds = Math.max(
              totalSeconds - remainingSeconds,
              0
            );

            payload = {
              astrologerId: session.astrologer_user_id,

              from: session.user_id,

              name: reqUser?.name || "",
              profilePicture:
                reqUser?.profilePicture || "",

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
          }

          logger.info(
            `[REJOIN] Emitting session_resume for session ${sessionId}`
          );

          socket.emit("session_resume", payload);

          await sendMissedMessages(
            socket,
            userId,
            sessionId
          );

          logger.info(
            `[REJOIN] Auto-resumed session ${sessionId} for user ${userId}`
          );

          return;
        }

        logger.info(
          `[REJOIN] Session ${sessionId} already expired`
        );
      } else {
        logger.info(
          `[REJOIN] No valid ongoing session found in redis for ${sessionId}`
        );
      }
    }

    // =========================================================
    // ✅ CASE 2: NO ACTIVE SESSION
    // CHECK RECENT CHAT REQUEST (ONLY ASTROLOGER)
    // =========================================================

    if (role === Enums.USER.ROLE.ASTROLOGER) {
      logger.info(
        `[REJOIN] Checking recent chat requests for astrologer ${userId}`
      );

      const thresholdTime = new Date(
        Date.now() - THRESHOLD_MS
      );

      // =========================================================
      // FIND OLDEST PENDING SESSION WITHIN THRESHOLD
      // =========================================================

      const pendingSession =
        await ConsultationSession.findOne({
          astrologer_user_id: userId,
          status: Enums.SERVICE.STATUS.PENDING,
          createdAt: {
            $gte: thresholdTime,
          },
        })
          .sort({ createdAt: 1 }) // oldest first
          .lean();

      if (!pendingSession) {
        logger.info(
          `[REJOIN] No pending sessions found within threshold`
        );

        socket.emit("session_resume_failed", {
          message:
            "No active session or recent chat request found.",
        });

        return;
      }

      logger.info(
        `[REJOIN] Found pending session ${pendingSession._id}`
      );

      // =========================================================
      // FETCH COMPLETE SESSION FROM REDIS
      // =========================================================

      const redisSession = await getSession(
        pendingSession._id.toString()
      );

      if (!redisSession) {
        logger.error(
          `[REJOIN] Redis session missing for ${pendingSession._id}`
        );

        socket.emit("session_resume_failed", {
          message: "Session data not found.",
        });

        return;
      }

      logger.info(
        `[REJOIN] Redis session recovered for ${pendingSession._id}`
      );

      // =========================================================
      // FETCH USER INFO
      // =========================================================

      let user = await getUser(redisSession.user_id);

      if (!user) {
        logger.info(
          `[REJOIN] User cache miss for ${redisSession.user_id}`
        );

        user = await getUserById(redisSession.user_id);

        if (user) {
          await saveUser(redisSession.user_id, user);

          logger.info(
            `[REJOIN] User cached for ${redisSession.user_id}`
          );
        }
      }

      // =========================================================
      // PREPARE PAYLOAD
      // =========================================================

      const payload = {
        from: redisSession.user_id,

        name: user?.name || "User",

        profilePicture:
          user?.profilePicture || "",

        sessionId: redisSession._id,

        chatId: redisSession.chat_id,

        duration:
          redisSession.duration_minutes,

        ratePerMinute:
          redisSession.rate_per_minute,

        totalAmount:
          redisSession.total_amount,

        channelId:
          redisSession.mode,

        message: `Recovered chat request from ${
          user?.name || "User"
        }`,

        mode: redisSession.mode,

        timestamp:
          redisSession.timestamp || Date.now(),
      };

      if(redisSession.mode === Enums.SERVICE.TYPE.CHAT) {

      logger.info(
        `[REJOIN] Emitting recovered chat_request_received for session ${redisSession._id}`
      );

      socket.emit(
        "chat_request_received",
        payload
      );

    }

    else if (redisSession.mode === Enums.SERVICE.TYPE.CALL || redisSession.mode === Enums.SERVICE.TYPE.VIDEO) {

      logger.info(
        `[REJOIN] Emitting recovered call_request_received for session ${redisSession._id}`
      );

      socket.emit(
        "agora_call_request_received",
        payload
      );

    }

      return;
    }

    // =========================================================
    // ❌ CASE 3: NOTHING FOUND
    // =========================================================

    logger.info(
      `[REJOIN] No session or chat request found for user ${userId}`
    );

    socket.emit("session_resume_failed", {
      message:
        "No active session or recent chat request found.",
    });
  } catch (err) {
    logger.error(
      `[REJOIN] Auto-rejoin failed for user ${userId}:`,
      err
    );

    socket.emit("session_resume_failed", {
      message: "Auto rejoin failed.",
    });
  }
};