const logger = require("../../utils/logger");
const emitSocketError = require("../../utils/socketError");
const Enums = require("../../utils/constants");
const {
  generateAgoraToken,
  generateChannelName,
} = require("../../services/agora/agoraService");
const { createChatSession } = require("../session/sessionService");
const { updateAstrologerBusyStatus } = require("../session/astrologerService");
const ConsultationSession = require("../../models/ConsultationSession");
const { isValidationAllowed } = require("../admin/validationSetting");
const { getUserById } = require("../session/userService");
const sendPushNotification = require("../notification/sendNotification");
const CacheService = require("../../utils/redis/cacheService");
const { finalizeSession } = require("../session/ledgerService");
const {
  getSession,
  updateSession,
  clearSession,
} = require("../../utils/redis/sessionCacheService");
const { autoRejectSession } = require("./autoRejectService");
const { profile } = require("winston");
const User = require("../../models/User");
const { setInSession } = require("../../utils/redis/sessionExtend");
const fs = require("fs");
const path = require("path");
const Astrologer = require("../../models/Astrologer");
const soundConfigPath = path.join(__dirname, "../public/soundConfig.json");

const serviceValidationMap = {
  [Enums.SERVICE.TYPE.CALL]: "isVoiceCallAllow",
  [Enums.SERVICE.TYPE.VIDEO]: "isVideoCallAllow",
  [Enums.SERVICE.TYPE.LIVE]: "isLiveStreamAllow",
};

function registerAgoraCallHandlers(socketManager, socket) {
  const { userId, role } = socket.user;
  logger.info(
    `[SOCKET] agora initialized for user ${userId} with role ${role}`,
  );
  socket.on(
    "agora_call_request_send",
    async ({ astrologerId, mode }, callback) => {
      try {
        const {
          saveUser,
          getUser,
        } = require("../../utils/redis/sessionCacheService");

        logger.info(
          `[SOCKET] agora_call_request_send from user ${userId} to astrologer ${astrologerId} (mode=${mode})`,
        );
        mode = Number(mode);
        if (!mode || isNaN(mode)) {
          return callback?.({
            success: false,
            message: "Service mode is required.",
          });
        }

        if (role === Enums.USER.ROLE.ASTROLOGER) {
          return callback?.({
            success: false,
            message: "Astrologers cannot initiate calls.",
          });
        }
        if (!astrologerId || astrologerId === userId) {
          return callback?.({
            success: false,
            message: "Invalid astrologer ID.",
          });
        }
        const settingKey = serviceValidationMap[mode];
        if (!settingKey) {
          return callback?.({
            success: false,
            message: "Invalid service type.",
          });
        }
        const busySessionId = await CacheService.isAstrologerBusy(astrologerId);
        if (busySessionId) {
          return callback?.({ success: false, message: "Astrologer is Busy" });
        }
        const allowed = await isValidationAllowed(settingKey);
        if (!allowed) {
          logger.warn(`[SOCKET] ${mode} request failed: feature disabled`);
          return callback?.({
            success: false,
            message: `${mode} feature is disabled.`,
          });
        }
        const session = await createChatSession({
          userId,
          astrologerUserId: astrologerId,
          mode,
        });
        if (!session.success) {
          logger.warn(`[SOCKET] agora_request_send failed: ${session.error}`);
          return callback?.({
            success: false,
            message: session.error || "Unable to create call session.",
          });
        }

        const serviceLabels = {
          [Enums.SERVICE.TYPE.CHAT]: "Chat",
          [Enums.SERVICE.TYPE.VIDEO]: "Video Call",
          [Enums.SERVICE.TYPE.CALL]: "Audio Call",
          [Enums.SERVICE.TYPE.PALMISTRY]: "Palmistry Session",
          [Enums.SERVICE.TYPE.REPORT]: "Report Consultation",
          [Enums.SERVICE.TYPE.POOJA]: "Pooja Service",
          [Enums.SERVICE.TYPE.LIVE]: "Live Session",
        };
        const serviceName = serviceLabels[mode] || "Service";
        let user = await getUser(userId);
        if (!user) {
          user = await getUserById(userId);
          if (user) {
            await saveUser(userId, user);
          }
        }
        const astrologer = await Astrologer.findOne({
          user_id: astrologerId,
        }).lean();
        const payload = {
          from: userId,
          name: astrologer?.display_name || "",
          profilePicture: user?.profilePicture || "",
          sessionId: session.session_id,
          chatId: session.chat_id,
          duration: session.duration,
          ratePerMinute: session.rate_per_minute,
          totalAmount: session.total_amount,
          mode,
          message: `Incoming ${serviceName} request from ${
            user?.name || "a user"
          }`,
          serviceName,
          timestamp: Date.now(),
          channelId: mode,
        };

        let notifiedVia = "none";
        const targetSockets = socketManager.userSockets.get(
          astrologerId.toString(),
        );
        if (targetSockets && targetSockets.size > 0) {
          logger.info(
            `[SOCKET] Sending ${serviceName} request via socket to astrologer ${astrologerId}`,
          );
          socketManager.io
            .to(`user_${astrologerId}`)
            .emit("agora_call_request_received", payload);
          notifiedVia = "socket";
        } else {
          (async () => {
            try {
              const pushSent = await sendPushNotification(
                astrologerId,
                `Incoming ${serviceName}`,
                payload.message,
                payload,
              );
              logger.info(
                `[SOCKET] Firebase push ${
                  pushSent ? "succeeded" : "failed"
                } for astrologer ${astrologerId}`,
              );
            } catch (pushErr) {
              logger.error(
                `[SOCKET] Push notification failed for astrologer ${astrologerId}:`,
                pushErr,
              );
            }
          })();
          notifiedVia = "push";
        }
        autoRejectSession(
          session.session_id,
          astrologerId,
          socketManager,
          30000,
        );

        return callback?.({
          success: true,
          sessionId: session.session_id,
          duration: session.duration,
          notifiedVia,
        });
      } catch (err) {
        logger.error("[SOCKET] agora_call_request_send error:", err);
        return emitSocketError(
          socket,
          "agora_call_error",
          "Failed to send call request.",
        );
      }
    },
  );
  socket.on("agora_call_request_accept", async ({ sessionId }, callback) => {
    const startTs = Date.now();
    logger.info(
      `[SOCKET] agora_call_request_accept triggered by ${userId} for session ${sessionId}`,
    );

    try {
      const {
        getSession,
        updateSession,
        clearSession,
        getUser,
        saveUser,
      } = require("../../utils/redis/sessionCacheService");
      const {
        emitAstrologerAvailability,
      } = require("./handleAstrologerEvents");

      if (role !== Enums.USER.ROLE.ASTROLOGER) {
        logger.warn(
          `[SOCKET] Non-astrologer ${userId} attempted to accept call`,
        );
        return emitSocketError(
          socket,
          "agora_call_accept_error",
          "Only astrologers can accept calls.",
        );
      }

      // 🔍 Step 1: Fetch session
      const existingSession = await getSession(sessionId);
      logger.debug(`[SOCKET] Existing session fetched`, {
        sessionId,
        existingSession,
      });

      if (
        !existingSession ||
        existingSession.status !== Enums.SERVICE.STATUS.PENDING
      ) {
        logger.error(
          `[SOCKET] Invalid/expired session: ${sessionId}`,
          existingSession,
        );
        return emitSocketError(
          socket,
          "agora_call_accept_error",
          "Invalid or expired session.",
        );
      }

      // 🔍 Step 2: Prepare Agora details
      const now = new Date();
      const billableEnd = new Date(
        now.getTime() + existingSession.duration_minutes * 60000,
      );
      const channelName = generateChannelName(existingSession.mode, sessionId);
      const userUid = Math.floor(Math.random() * 100000);
      const astroUid = Math.floor(Math.random() * 100000) + 100000;

      logger.debug(`[SOCKET] Agora setup`, {
        channelName,
        userUid,
        astroUid,
        duration: existingSession.duration_minutes,
      });

      const userToken = await generateAgoraToken(
        channelName,
        userUid,
        "publisher",
        existingSession.duration_minutes,
      );
      const astroToken = await generateAgoraToken(
        channelName,
        astroUid,
        "publisher",
        existingSession.duration_minutes,
      );

      // 🔍 Step 3: Update session DB
      const updatedSession = await ConsultationSession.findByIdAndUpdate(
        sessionId,
        {
          status: Enums.SERVICE.STATUS.ONGOING,
          payment_status: Enums.PAYMENT.STATUS.PENDING,
          start_time: now,
          end_time: billableEnd,
        },
        { new: true },
      );

      logger.info(`[SOCKET] Session updated to ONGOING`, {
        sessionId,
        updatedSession,
      });

      if (updatedSession.is_free) {
        await User.findByIdAndUpdate(updatedSession.user_id, {
          $inc: { freeSessionUsed: 1 },
          $set: { lastFreeSessionUsedAt: new Date() },
        });
        logger.debug(
          `[SOCKET] Free session count updated for user ${updatedSession.user_id}`,
        );
      }

      await setInSession(sessionId, updatedSession.user_id, true);
      await setInSession(sessionId, updatedSession.astrologer_user_id, true);

      // 🔍 Step 4: Fetch astrologer and user
      let astrologer = await getUser(updatedSession.astrologer_user_id);
      if (!astrologer) {
        astrologer = await getUserById(updatedSession.astrologer_user_id);
        if (astrologer)
          await saveUser(updatedSession.astrologer_user_id, astrologer);
      }
      logger.debug(`[SOCKET] Astrologer fetched`, {
        astrologerId: updatedSession.astrologer_user_id,
        astrologer,
      });

      await updateSession(sessionId, {
        ...updatedSession.toObject(),
        agora: {
          channelName,
          userUid,
          astroUid,
          userToken,
          astroToken,
          mode: updatedSession.mode,
        },
      });
      await CacheService.markAstrologerBusy(userId, sessionId);
      socketManager.setActiveSession(updatedSession.user_id, userId, sessionId);

      // 🔍 Timeout tracking
      const timeoutMs = updatedSession.duration_minutes * 60 * 1000 + 30000;
      const timeout = setTimeout(async () => {
        logger.warn(`[SOCKET] Auto-ending session ${sessionId} after timeout`);
        socketManager.clearActiveSession(
          updatedSession.user_id.toString(),
          updatedSession.astrologer_user_id.toString(),
        );
        socketManager.sessionTimeouts.delete(sessionId);
        await clearSession(sessionId);
        await CacheService.clearAstrologerBusy(updatedSession.astrologer_id);
        const result = await finalizeSession(
          sessionId,
          userId,
          "Auto-ended by system on duration expiry",
        );
        if (result) {
          const autoEndPayload = {
            sessionId: result.session._id,
            timestamp: Date.now(),
            message: "Call auto-completed after allotted duration.",
          };
          socketManager.io
            .to(`user_${result.session.user_id}`)
            .emit("agora_call_auto_completed", autoEndPayload);
          socketManager.io
            .to(`user_${result.session.astrologer_user_id}`)
            .emit("agora_call_auto_completed", autoEndPayload);
        }
      }, timeoutMs);
      socketManager.sessionTimeouts.set(sessionId, timeout);

      let user = await getUser(updatedSession.user_id);
      if (!user) {
        user = await getUserById(updatedSession.user_id);
        if (user) await saveUser(updatedSession.user_id, user);
      }

      logger.debug(`[SOCKET] User fetched`, { userId, user });

      // Fetch the active sound URL (global, as per your config setup)
      const soundUrl = getActiveSoundUrl();
      logger.debug(`[SOCKET] Active sound fetched`, { soundUrl });
      const astrologerProfile = await Astrologer.findOne({
        user_id: updatedSession.astrologer_user_id,
      }).lean();
      // 🔍 Step 5: Payloads
      const userPayload = {
        sessionId: updatedSession._id,
        channelName,
        name: astrologerProfile?.display_name || "",
        profilePicture: astrologer?.profilePicture || "",
        userToken,
        userUid,
        astroToken,
        astroUid,
        mode: updatedSession.mode,
        astrologerId: updatedSession.astrologer_user_id,
        chatId: updatedSession.chat_id || null,
        duration: updatedSession.duration_minutes,
        ratePerMinute: updatedSession.rate_per_minute,
        totalAmount: updatedSession.total_amount,
        startTime: updatedSession.start_time,
        timestamp: Date.now(),
        message: "Your call request has been accepted.",
        soundUrl,
      };

      const payload = {
        sessionId: updatedSession._id,
        channelName,
        name: user?.name || "",
        profilePicture: user?.profilePicture || "",
        userToken,
        userUid,
        astroToken,
        astroUid,
        mode: updatedSession.mode,
        astrologerId: updatedSession.astrologer_user_id,
        chatId: updatedSession.chat_id || null,
        duration: updatedSession.duration_minutes,
        ratePerMinute: updatedSession.rate_per_minute,
        totalAmount: updatedSession.total_amount,
        startTime: updatedSession.start_time,
        timestamp: Date.now(),
        message: "Your call request has been accepted.",
        soundUrl,
      };

      // 🔍 Log payloads for clarity
      logger.debug(`[SOCKET] Payloads prepared`, {
        userPayloadName: userPayload.name,
        userPayloadPic: userPayload.profilePicture,
        astroPayloadName: payload.name,
        astroPayloadPic: payload.profilePicture,
      });

      socketManager.io
        .to(`user_${updatedSession.user_id}`)
        .emit("agora_call_request_accepted", userPayload);
      socketManager.io
        .to(`user_${updatedSession.astrologer_user_id}`)
        .emit("agora_call_request_accepted", payload);

      emitAstrologerAvailability({
        astrologer_user_id: updatedSession.astrologer_user_id,
        is_busy: true,
      });

      logger.info(
        `[SOCKET] agora_call_request_accept completed in ${
          Date.now() - startTs
        }ms`,
      );
      callback?.({ success: true, payload });
    } catch (err) {
      logger.error("[SOCKET] agora_call_request_accept error:", err);
      return emitSocketError(
        socket,
        "agora_call_accept_error",
        "Internal error during accept.",
      );
    }
  });
  const getActiveSoundUrl = () => {
    try {
      if (!fs.existsSync(soundConfigPath)) {
        return null;
      }
      const config = JSON.parse(fs.readFileSync(soundConfigPath, "utf8"));
      return config.activeSound ? config.activeSound.url : null;
    } catch (err) {
      console.error("[SOCKET] Failed to read sound config:", err);
      return null;
    }
  };
}
module.exports = registerAgoraCallHandlers;
