const logger = require("../../utils/logger");
const emitSocketError = require("../../utils/socketError");
const ConsultationSession = require("../../models/ConsultationSession");
const userService = require("../../services/session/userService");
const Enums = require("../../utils/constants");
const { createChatSession } = require("../../services/session/sessionService");
const {
  createLedgerEntriesForSession,
  finalizeSession,
} = require("../session/ledgerService");
const User = require("../../models/User");
const Wallet = require("../../models/Wallet");
const { isValidationAllowed } = require("../admin/validationSetting");
const sendPushNotification = require("../notification/sendNotification");
const CacheService = require("../../utils/redis/cacheService");
const { rollbackFreeSessionUsage } = require("../admin/session/sessionSetting");
const { autoRejectSession } = require("./autoRejectService");
const { getUserById } = require("../session/userService");
const {
  incrementSessionExtended,
  isSessionExtended,
  getSessionExtendedCount,
  setInSession,
  clearInSession,
  getInSession,
} = require("../../utils/redis/sessionExtend");
const kundliService = require("../../services/kundli/kundliService");
const { name } = require("ejs");

function handleChatRequestEvents(socketManager, socket) {
  const { userId, role } = socket.user;
  logger.info(
    `[SOCKET] chatRequestService initialized for user ${userId} with role ${role}`,
  );
  socket.on("chat_request_send", async ({ astrologerId }, callback) => {
    try {
      const {
        saveUser,
        getUser,
      } = require("../../utils/redis/sessionCacheService");
      const {
        emitAstrologerAvailability,
      } = require("./handleAstrologerEvents");
      logger.info(
        `[SOCKET] chat_request_send initiated by user ${userId} to astrologer ${astrologerId}`,
      );
      if (role === Enums.USER.ROLE.ASTROLOGER) {
        return callback?.({
          success: false,
          message: "Astrologers cannot initiate chat requests.",
        });
      }
      if (!astrologerId || astrologerId === userId) {
        return callback?.({
          success: false,
          message: "Invalid astrologer ID.",
        });
      }
      const busySessionId = await CacheService.isAstrologerBusy(astrologerId);
      console.log(
        `Checked busy status for astrologer ${astrologerId}: ${busySessionId ? "Busy" : "Available"}`,
      );
      if (busySessionId) {
        console.log(
          `Astrologer ${astrologerId} is currently busy with session ${busySessionId}`,
        );
        return callback?.({ success: false, message: "Astrologer is Busy" });
      }
      if (busySessionId) {
        const {
          addUserToBusyWaitList,
        } = require("../../utils/redis/sessionCacheService");
        await addUserToBusyWaitList(astrologerId, userId);

        return callback?.({ success: false, message: "Astrologer is Busy" });
      }
      const allowed = await isValidationAllowed("ischatAllow");
      if (!allowed) {
        return callback?.({
          success: false,
          message: "Chat Feature is Disabled.",
        });
      }
      const session = await createChatSession({
        userId,
        astrologerUserId: astrologerId,
      });
      (async () => {
        try {
          await kundliService.getCompleteKundliByUserId(userId);
          logger.info(`[KUNDLI] Prefetch completed for user ${userId}`);
        } catch (err) {
          logger.error(`[KUNDLI] Prefetch failed for user ${userId}`, err);
        }
      })();
      if (!session.success) {
        logger.error(
          `[SOCKET] chat_request_send failed to create session: ${session.error}`,
        );
        return callback?.({
          success: false,
          message: session.error || "Unable to create chat session.",
        });
      }
      let user = await getUser(userId);
      if (!user) {
        user = await getUserById(userId);
        if (user) {
          await saveUser(userId, user);
        }
      }
      console.log("timestamp in payload ", session.timestamp);
      const payload = {
        from: userId,
        name: user?.name || "Unknown",
        profilePicture: user?.profilePicture || "",
        sessionId: session.session_id,
        chatId: session.chat_id,
        duration: session.duration,
        ratePerMinute: session.rate_per_minute,
        totalAmount: session.total_amount,
        channelId: Enums.SERVICE.TYPE.CHAT,
        message: `New chat request from user ${user?.name}`,
        timestamp: session.timestamp,
      };

      await CacheService.markAstrologerBusy(astrologerId, session.session_id);
      const targetSockets = socketManager.userSockets.get(astrologerId);
      let notifiedVia = "none";
      // if (targetSockets && targetSockets.size > 0) {
      logger.info(
        `[SOCKET] Sending chat request via socket to astrologer ${astrologerId}`,
      );
      socketManager.io
        .to(`user_${astrologerId}`)
        .emit("chat_request_received", payload);
      notifiedVia = "socket";
      // } else {
      (async () => {
        try {
          const pushSent = await sendPushNotification(
            astrologerId,
            "New Chat Request",
            payload.message,
            payload,
            "chat_messages",
            "hindi.mp3",
          );
          logger.info(
            `[SOCKET] Firebase push ${pushSent ? "succeeded" : "failed"} for astrologer ${astrologerId}`,
          );
        } catch (pushErr) {
          logger.error(
            `[SOCKET] Push notification failed for astrologer ${astrologerId}:`,
            pushErr,
          );
        }
      })();
      notifiedVia = "push";
      // }
      emitAstrologerAvailability({
        astrologer_user_id: astrologerId,
        is_busy: true,
      });
      autoRejectSession(session.session_id, astrologerId, socketManager, 30000);
      return callback?.({
        success: true,
        sessionId: session.session_id,
        duration: session.duration,
        notifiedVia,
      });
    } catch (err) {
      logger.error(`[SOCKET] chat_request_send error for user ${userId}:`, err);
      return emitSocketError(
        socket,
        "chat_request_error",
        "Failed to send chat request.",
      );
    }
  });
  socket.on("chat_request_cancel", async ({ sessionId, reason }, callback) => {
    try {
      const {
        getSession,
        clearSession,
      } = require("../../utils/redis/sessionCacheService");
      const {
        emitAstrologerAvailability,
      } = require("./handleAstrologerEvents");

      logger.info(
        `[SOCKET] chat_request_cancel userId=${userId} sessionId=${sessionId}`,
      );

      if (role !== Enums.USER.ROLE.USER) {
        return emitSocketError(
          socket,
          "chat_cancel_error",
          "Only users can cancel chat requests.",
        );
      }

      const session = await getSession(sessionId);
      logger.info(
        `[SOCKET] Session fetched for cancellation: ${JSON.stringify(session)}`,
      );

      if (!session || session.status !== Enums.SERVICE.STATUS.PENDING) {
        return emitSocketError(
          socket,
          "chat_cancel_error",
          "Invalid or expired session.",
        );
      }

      const cancelReason = reason || "User cancelled the chat request";

      // Clear session from cache
      await clearSession(sessionId);

      await CacheService.clearAstrologerBusy(session.astrologer_user_id);

      const targetSockets = socketManager.userSockets.get(
        session.astrologer_user_id,
      );
      let notifiedVia = "none";

      let commununicationMode = "none";
      if (session.mode === Enums.SERVICE.TYPE.CHAT) {
        commununicationMode = "chat";
      } else if (session.mode === Enums.SERVICE.TYPE.CALL) {
        commununicationMode = "call";
      } else if (session.mode === Enums.SERVICE.TYPE.VIDEO) {
        commununicationMode = "video call";
      }

      // Notify astrologer immediately
      // if (targetSockets && targetSockets.size > 0) {
      socketManager.io
        .to(`user_${session.astrologer_user_id}`)
        .emit("chat_request_cancelled", {
          userId,
          sessionId,
          reason: cancelReason,
          timestamp: Date.now(),
          message: `User has cancelled the ${commununicationMode} request.`,
        });
      notifiedVia = "socket";
      // }else {
      (async () => {
        try {
          const pushSent = await sendPushNotification(
            session.astrologer_user_id,
            "Request Cancelled",
            `User has cancelled the ${commununicationMode} request.`,
            { sessionId, reason: cancelReason, channelId: 1008 },
          );
          logger.info(
            `[SOCKET] Firebase push ${pushSent ? "succeeded" : "failed"} for cancellation to astrologer ${session.astrologer_user_id}`,
          );
        } catch (pushErr) {
          logger.error(
            `[SOCKET] Push notification failed for cancellation to astrologer ${session.astrologer_user_id}:`,
            pushErr,
          );
        }
      })();

      notifiedVia = "push";
      // }

      console.log(
        `Notified astrologer ${session.astrologer_user_id} of cancellation via ${notifiedVia}`,
      );

      emitAstrologerAvailability({
        astrologer_user_id: session.astrologer_user_id,
        is_busy: false,
      });

      logger.info(
        `[SOCKET] chat_request_cancelled emitted to user_${session.astrologer_user_id}`,
      );

      // Respond immediately to user
      callback?.({ success: true });

      // Background DB update
      (async () => {
        try {
          await ConsultationSession.findByIdAndUpdate(
            sessionId,
            {
              status: Enums.SERVICE.STATUS.CANCELLED,
              status_reason:
                Enums.SERVICE.STATUS_REASON.CANCELLED.USER_CANCELLED,
              cancellation_reason: cancelReason,
            },
            { new: true },
          );
          logger.info(
            `[SOCKET] Session ${sessionId} updated to CANCELLED in DB.`,
          );
        } catch (err) {
          logger.error(
            `[SOCKET] Failed to update session ${sessionId} in DB:`,
            err,
          );
        }
      })();
    } catch (err) {
      logger.error("[SOCKET] chat_request_cancel error:", err);
      return emitSocketError(
        socket,
        "chat_cancel_error",
        "Internal error during cancellation.",
      );
    }
  });
  socket.on("chat_request_accept", async ({ sessionId }, callback) => {
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
        return emitSocketError(
          socket,
          "chat_accept_error",
          "Only astrologers can accept chat requests.",
        );
      }
      const session = await getSession(sessionId);
      logger.info(
        `[SOCKET] Session fetched for acceptance: ${JSON.stringify(session)}`,
      );
      if (!session || session.status !== Enums.SERVICE.STATUS.PENDING) {
        return emitSocketError(
          socket,
          "chat_accept_error",
          "Invalid or expired session.",
        );
      }
      const now = new Date();
      const billableEnd = new Date(
        now.getTime() + session.duration_minutes * 60000,
      );
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
      await updateSession(sessionId, updatedSession.toObject());
      await setInSession(sessionId, updatedSession.user_id, true);
      await setInSession(sessionId, updatedSession.astrologer_user_id, true);
      if (updatedSession.is_free) {
        await User.findByIdAndUpdate(updatedSession.user_id, {
          $inc: { freeSessionUsed: 1 },
          $set: { lastFreeSessionUsedAt: new Date() },
        });
      }
      let astrologer = await getUser(updatedSession.astrologer_user_id);
      if (!astrologer) {
        astrologer = await getUserById(updatedSession.astrologer_user_id);
        if (astrologer) {
          await saveUser(updatedSession.astrologer_user_id, astrologer);
        }
      }
      let reqUser = await getUser(updatedSession.user_id);
      if (!reqUser) {
        reqUser = await getUserById(updatedSession.user_id);
        if (reqUser) {
          await saveUser(updatedSession.user_id, reqUser);
        }
      }
      // await CacheService.markAstrologerBusy(userId, sessionId);
      socketManager.setActiveSession(updatedSession.user_id, userId, sessionId);
      const durationMs = updatedSession.duration_minutes * 60 * 1000;
      const bufferMs = 60000;
      logger.info(
        `[SOCKET] chat_request_accept → Session ${sessionId} started. Duration=${updatedSession.duration_minutes} min, auto-timeout in ${(durationMs + bufferMs) / 1000}s (includes 60s buffer).`,
      );
      const durationTimeout = setTimeout(() => {
        logger.info(
          `[SOCKET] Session ${sessionId} duration completed. Entering ${bufferMs / 1000}s buffer period for recharge/extension.`,
        );
        socketManager.io
          .to(`user_${updatedSession.astrologer_user_id}`)
          .emit("session_duration_completed", {
            sessionId,
            timestamp: Date.now(),
            message:
              "Session duration completed. Please wait while we process the session.",
          });
      }, durationMs);
      const finalTimeout = setTimeout(async () => {
        try {
          logger.info(
            `[SOCKET] Session ${sessionId} auto-timeout reached. Finalizing session...`,
          );
          socketManager.clearActiveSession(
            updatedSession.user_id.toString(),
            updatedSession.astrologer_user_id.toString(),
          );
          socketManager.sessionTimeouts.delete(sessionId);
          await CacheService.clearAstrologerBusy(
            updatedSession.astrologer_user_id,
          );
          await clearSession(sessionId);
          await clearInSession(sessionId);
          const statusReason = Enums.SERVICE.STATUS_REASON.COMPLETED.DURATION_EXPIRED;
          const result = await finalizeSession(
            sessionId,
            userId,
            statusReason,
            "Auto-ended by system on duration expiry",
          );
          if (result) {
            socketManager.io
              .to(`user_${result.session.user_id}`)
              .emit("chat_auto_completed", {
                sessionId: result.session._id,
                timestamp: Date.now(),
                message: "Session auto-completed after allotted duration.",
              });
            socketManager.io.to(`user_${userId}`).emit("chat_auto_completed", {
              sessionId: result.session._id,
              timestamp: Date.now(),
              message: "Session auto-completed after allotted duration.",
            });
            logger.info(
              `[SOCKET] Session ${sessionId} successfully auto-ended.`,
            );
          }
        } catch (err) {
          logger.error(
            `[SOCKET] Error while finalizing auto-timeout for session ${sessionId}:`,
            err,
          );
        }
      }, durationMs + bufferMs);
      socketManager.sessionTimeouts.set(sessionId, {
        durationTimeout,
        finalTimeout,
      });
      const chatAcceptedPayload = {
        astrologerId: userId,
        astrologer_id: updatedSession.astrologer_id,
        from: updatedSession.user_id,
        name: reqUser.name,
        profilePicture: reqUser?.profilePicture || "",
        sessionId: updatedSession._id,
        chatId: updatedSession.chat_id,
        duration: updatedSession.duration_minutes,
        ratePerMinute: updatedSession.rate_per_minute,
        totalAmount: updatedSession.total_amount,
        startTime: updatedSession.start_time,
        timestamp: Date.now(),
        message: "Your chat request has been accepted.",
      };

      socketManager.io
        .to(`user_${updatedSession.user_id}`)
        .emit("chat_request_accepted", {
          astrologerId: userId,
          astrologer_id: updatedSession.astrologer_id,
          name: session?.astrologer_display_name || astrologer.name,
          profilePicture: astrologer?.profilePicture || "",
          sessionId: updatedSession._id,
          chatId: updatedSession.chat_id,
          duration: updatedSession.duration_minutes,
          ratePerMinute: updatedSession.rate_per_minute,
          totalAmount: updatedSession.total_amount,
          startTime: updatedSession.start_time,
          timestamp: Date.now(),
          message: "Your chat request has been accepted.",
        });
      socketManager.io
        .to(`user_${updatedSession.astrologer_user_id}`)
        .emit("chat_request_accepted", {
          astrologerId: userId,
          from: updatedSession.user_id,
          name: reqUser.name,
          profilePicture: reqUser?.profilePicture || "",
          astrologer_id: updatedSession.astrologer_id,
          sessionId: updatedSession._id,
          chatId: updatedSession.chat_id,
          duration: updatedSession.duration_minutes,
          ratePerMinute: updatedSession.rate_per_minute,
          totalAmount: updatedSession.total_amount,
          startTime: updatedSession.start_time,
          timestamp: Date.now(),
          message: "Your chat request has been accepted.",
        });
      emitAstrologerAvailability({
        astrologer_user_id: updatedSession.astrologer_user_id,
        is_busy: true,
      });
      callback?.({ success: true, session: chatAcceptedPayload });
    } catch (err) {
      logger.error("[SOCKET] chat_request_accept error:", err);
      return emitSocketError(
        socket,
        "chat_accept_error",
        "Internal error during accept.",
      );
    }
  });
  socket.on("chat_session_extend", async ({ sessionId }, callback) => {
    try {
      const {
        getSession,
        updateSession,
        clearSession,
      } = require("../../utils/redis/sessionCacheService");

      logger.info(
        `[SOCKET] chat_session_extend called. sessionId=${sessionId}, userId=${userId}`,
      );

      // =========================================================
      // FETCH SESSION
      // =========================================================

      const session = await getSession(sessionId);

      if (!session) {
        return callback?.({
          success: false,
          message: "Session not found.",
        });
      }

      // =========================================================
      // CHECK IN SESSION
      // =========================================================

      const userIn = await getInSession(sessionId, session.user_id);

      if (!userIn) {
        return callback?.({
          success: false,
          message: "User is not in session.",
        });
      }

      // =========================================================
      // VALIDATE STATUS
      // =========================================================

      if (session.status !== Enums.SERVICE.STATUS.ONGOING) {
        return callback?.({
          success: false,
          message: "Session is not active.",
        });
      }

      // =========================================================
      // ANTI SPAM
      // =========================================================

      const now = new Date();

      if (
        session.last_extended_at &&
        now - new Date(session.last_extended_at) < 5000
      ) {
        return callback?.({
          success: false,
          message: "Please wait before trying to extend again.",
        });
      }

      // =========================================================
      // WALLET
      // =========================================================

      const wallet = await Wallet.findOne({
        user_id: session.user_id,
      });

      if (!wallet) {
        return callback?.({
          success: false,
          message: "Wallet not found.",
        });
      }

      // =========================================================
      // ELAPSED TIME
      // =========================================================

      const elapsedMs = now - new Date(session.start_time);

      const elapsedMinutes = Math.min(
        Math.ceil(elapsedMs / 60000),
        session.duration_minutes,
      );

      // =========================================================
      // FREE CALCULATIONS
      // =========================================================

      const freeDuration = session.freeDuration ?? 0;

      const freeConsumed = Math.min(elapsedMinutes, freeDuration);

      const walletConsumed = Math.max(0, elapsedMinutes - freeConsumed);

      // =========================================================
      // WALLET CALCULATIONS
      // =========================================================

      const walletBalance = wallet.balance;

      const ratePerMin = session.rate_per_minute;

      const walletMinutesAvailable = Math.floor(walletBalance / ratePerMin);

      const additionalWalletMinutes = Math.max(
        0,
        walletMinutesAvailable - walletConsumed,
      );

      // =========================================================
      // NEW TOTAL DURATION
      // =========================================================

      const totalNewMinutes = elapsedMinutes + additionalWalletMinutes;

      if (totalNewMinutes <= elapsedMinutes) {
        return callback?.({
          success: false,
          message: "Not enough balance to extend session.",
        });
      }

      // =========================================================
      // IMPORTANT FIX
      // =========================================================

      const previousTotalDuration = session.duration_minutes;

      const additionalMinutes = Math.max(
        totalNewMinutes - previousTotalDuration,
        0,
      );

      logger.info(
        `[EXTEND FIX] previousTotalDuration=${previousTotalDuration}`,
      );

      logger.info(`[EXTEND FIX] totalNewMinutes=${totalNewMinutes}`);

      logger.info(`[EXTEND FIX] additionalMinutes=${additionalMinutes}`);

      // =========================================================
      // NO NEW MINUTES
      // =========================================================

      if (additionalMinutes <= 0) {
        return callback?.({
          success: false,
          message: "No additional minutes available.",
        });
      }

      // =========================================================
      // NEW END TIME
      // =========================================================

      let graceTimeMs = 0;

      if (now > new Date(session.end_time)) {
        graceTimeMs = now - new Date(session.end_time);
      }

      const totalBufferTime = (session.total_buffer_time || 0) + graceTimeMs;

      console.log(
        `previous end time: ${session.end_time}, now: ${now}, graceTimeMs: ${graceTimeMs}`,
      );

      const newEndTime = new Date(
        new Date(session.end_time).getTime() +
          additionalMinutes * 60000 +
          graceTimeMs,
      );

      console.log(
        `Grace time (ms): ${graceTimeMs}, New end time: ${newEndTime}`,
      );

      // =========================================================
      // UPDATE DB
      // =========================================================

      const updatedSession = await ConsultationSession.findByIdAndUpdate(
        sessionId,
        {
          $set: {
            duration_minutes: totalNewMinutes,

            end_time: newEndTime,

            last_extended_at: now,

            total_buffer_time: totalBufferTime,
          },
        },
        { new: true },
      );

      // =========================================================
      // UPDATE REDIS
      // =========================================================

      await updateSession(sessionId, updatedSession.toObject());

      // =========================================================
      // CLEAR OLD TIMERS
      // =========================================================

      const oldTimeouts = socketManager.sessionTimeouts.get(sessionId);

      if (oldTimeouts) {
        clearTimeout(oldTimeouts.durationTimeout);

        clearTimeout(oldTimeouts.finalTimeout);
      }

      // =========================================================
      // TIMER FIX
      // =========================================================

      const bufferMs = 60000;

      const endTimeMs = new Date(updatedSession.end_time).getTime();

      const actualRemainingMs = Math.max(endTimeMs - Date.now(), 0);

      // =========================================================
      // DURATION TIMER
      // =========================================================

      const durationTimeout = setTimeout(() => {
        logger.info(
          `[EXTEND TIMER] Session ${sessionId} reached scheduled end time`,
        );

        console.log(
          `Emitting session_duration_completed for session ${sessionId} at ${new Date().toISOString()} for astrologer ${session.astrologer_user_id}`,
        );

        socketManager.io
          .to(`user_${session.astrologer_user_id}`)
          .emit("session_duration_completed", {
            sessionId,
            timestamp: Date.now(),
            message:
              "Session duration completed. Please wait while we process the session.",
          });
      }, actualRemainingMs);

      // =========================================================
      // FINAL TIMER
      // =========================================================

      const finalTimeout = setTimeout(async () => {
        try {
          const latestSession = await ConsultationSession.findById(sessionId);

          if (!latestSession) return;

          const latestEndTime = new Date(latestSession.end_time).getTime();

          if (Date.now() < latestEndTime + bufferMs) {
            logger.info(
              `[EXTEND TIMER] Session extended again. Ignoring old timeout.`,
            );

            return;
          }

          await CacheService.clearAstrologerBusy(
            latestSession.astrologer_user_id,
          );

          await clearSession(sessionId);

          await clearInSession(sessionId);

          const statusReason = Enums.SERVICE.STATUS_REASON.COMPLETED.DURATION_EXPIRED;

          const result = await finalizeSession(
            sessionId,
            userId,
            statusReason,
            "Auto-ended after extended time",
          );

          if (result) {
            socketManager.io
              .to(`user_${result.session.user_id}`)
              .emit("chat_auto_completed", {
                sessionId: result.session._id,

                timestamp: Date.now(),

                message: "Session auto-completed after extended time.",
              });

            socketManager.io
              .to(`user_${result.session.astrologer_user_id}`)
              .emit("chat_auto_completed", {
                sessionId: result.session._id,

                timestamp: Date.now(),

                message: "Session auto-completed after extended time.",
              });

            socketManager.clearActiveSession(
              result.session.user_id,
              result.session.astrologer_user_id,
            );

            socketManager.sessionTimeouts.delete(sessionId);
          }
        } catch (err) {
          logger.error(
            `[EXTEND TIMER] Error finalizing session ${sessionId}:`,
            err,
          );
        }
      }, actualRemainingMs + bufferMs);

      // =========================================================
      // SAVE TIMERS
      // =========================================================

      socketManager.sessionTimeouts.set(sessionId, {
        durationTimeout,
        finalTimeout,
      });

      // =========================================================
      // PAYLOAD
      // =========================================================

      const payload = {
        sessionId,

        additionalMinutes,

        totalDuration: updatedSession.duration_minutes,

        remainingMinutes: totalNewMinutes - elapsedMinutes,

        timestamp: Date.now(),

        message: `Session extended by ${additionalMinutes} minutes.`,

        channelId: updatedSession.mode,
      };

      // =========================================================
      // EMIT
      // =========================================================

      socketManager.io
        .to(`user_${updatedSession.astrologer_user_id}`)
        .emit("chat_session_extended", payload);

      // =========================================================
      // CALLBACK
      // =========================================================

      return callback?.({
        success: true,

        additionalMinutes,

        totalDuration: updatedSession.duration_minutes,

        remainingMinutes: totalNewMinutes - elapsedMinutes,

        sessionId,
      });
    } catch (err) {
      logger.error("[SOCKET] chat_session_extend error:", err);

      return callback?.({
        success: false,
        message: "Failed to extend session.",
      });
    }
  });
  socket.on("chat_request_reject", async ({ sessionId, reason }, callback) => {
    try {
      const {
        getSession,
        updateSession,
        clearSession,
      } = require("../../utils/redis/sessionCacheService");

      logger.info(
        `[SOCKET] chat_request_reject userId=${userId} sessionId=${sessionId}`,
      );
      if (role !== Enums.USER.ROLE.ASTROLOGER) {
        return emitSocketError(
          socket,
          "chat_reject_error",
          "Only astrologers can reject chat requests.",
        );
      }
      const session = await getSession(sessionId);
      logger.info(
        `[SOCKET] Session fetched for rejection: ${JSON.stringify(session)}`,
      );
      if (!session || session.status !== Enums.SERVICE.STATUS.PENDING) {
        return emitSocketError(
          socket,
          "chat_reject_error",
          "Invalid or expired session.",
        );
      }
      const rejectionReason = reason || "Astrologer rejected the request";
      if (session.is_free) {
        (async () => {
          try {
            // await rollbackFreeSessionUsage(session.user_id, null);
          } catch (err) {
            logger.error(
              `Background rollbackFreeSessionUsage failed for user ${session.user_id}:`,
              err,
            );
          }
        })();
      }
      // await session.updateOne({
      //   status: Enums.SERVICE.STATUS.REJECTED,
      //   rejection_reason: rejectionReason,
      // });
      await clearSession(sessionId);

      const updatedSession = await ConsultationSession.findByIdAndUpdate(
        sessionId,
        {
          status: Enums.SERVICE.STATUS.REJECTED,
          status_reason:
            Enums.SERVICE.STATUS_REASON.CANCELLED.ASTROLOGER_REJECTED,
          rejection_reason: rejectionReason,
        },
        { new: true },
      );
      socketManager.io
        .to(`user_${session.user_id}`)
        .emit("chat_request_rejected", {
          astrologerId: userId,
          sessionId,
          name: session?.astrologer_display_name || "Astrologer",
          reason: rejectionReason,
          timestamp: Date.now(),
          message: "Your chat request has been rejected.",
        });
      logger.info(
        `[SOCKET] chat_request_rejected emitted to user_${session.user_id}`,
      );
      return callback?.({ success: true });
    } catch (err) {
      logger.error("[SOCKET] chat_request_reject error:", err);
      return emitSocketError(
        socket,
        "chat_reject_error",
        "Internal error during reject.",
      );
    }
  });
  socket.on("chat_session_end", async ({ sessionId }, callback) => {
    logger.info(
      `[SOCKET] chat_session_end called for sessionId=${sessionId} by userId=${userId}`,
    );

    try {
      const {
        getSession,
        updateSession,
        clearSession,
      } = require("../../utils/redis/sessionCacheService");

      const session = await getSession(sessionId);
      logger.info(
        `[SOCKET] Fetched session from cache: ${JSON.stringify(session, null, 2)}`,
      );

      if (!session) {
        logger.warn(`[SOCKET] Session not found for sessionId=${sessionId}`);
        return emitSocketError(socket, "chat_end_error", "Session not found.");
      }

      if (
        ![
          session.user_id.toString(),
          session.astrologer_user_id.toString(),
        ].includes(userId.toString())
      ) {
        logger.warn(
          `[SOCKET] Unauthorized chat end attempt by userId=${userId} for sessionId=${sessionId}`,
        );
        return emitSocketError(
          socket,
          "chat_end_error",
          "Unauthorized action.",
        );
      }

      logger.info(
        `[SOCKET] Clearing astrologer busy status for astrologerId=${session.astrologer_user_id}`,
      );
      await CacheService.clearAstrologerBusy(session.astrologer_user_id);

      logger.info(`[SOCKET] Clearing session cache for sessionId=${sessionId}`);
      await clearSession(sessionId);
      await clearInSession(sessionId);
      logger.info(
        `[SOCKET] Clearing active session references and deleting session timeout`,
      );
      socketManager.clearActiveSession(
        session.user_id.toString(),
        session.astrologer_user_id.toString(),
      );
      const timeouts = socketManager.sessionTimeouts.get(sessionId);
      if (timeouts) {
        clearTimeout(timeouts.durationTimeout);
        clearTimeout(timeouts.finalTimeout);
      }
      socketManager.sessionTimeouts.delete(sessionId);

      const payload = {
        sessionId: session._id,
        endedBy: userId,
        timestamp: Date.now(),
        message: "Chat session ended manually.",
        channelId: session.mode,
      };

      logger.info(`[SOCKET] Emitting chat_manually_ended to user socket`);
      socketManager.io
        .to(`user_${session.user_id}`)
        .emit("chat_manually_ended", payload);

      const astroSockets = socketManager.userSockets.get(
        session.astrologer_user_id.toString(),
      );
      if (astroSockets && astroSockets.size > 0) {
        logger.info(
          `[SOCKET] Emitting chat_manually_ended to astrologer sockets`,
        );
        socketManager.io
          .to(`user_${session.astrologer_user_id}`)
          .emit("chat_manually_ended", payload);
      } else {
        logger.info(`[SOCKET] Astrologer offline, sending push notification`);
        await sendPushNotification(
          session.astrologer_user_id,
          "Chat Ended",
          payload.message,
          payload,
        );
      }

      logger.info(
        `[SOCKET] Callback sent to client for sessionId=${sessionId}`,
      );
      callback?.({
        success: true,
        message: "Session ended and notifications sent.",
      });

      // --- Background finalize ---
      (async () => {
        try {
          const now = new Date();
          const extensionCount = await getSessionExtendedCount(sessionId); // 0 if never extended
          logger.info(`[Session] Session extension count: ${extensionCount}`);
          const session = await ConsultationSession.findById(sessionId);
          if (!session) {
            logger.warn(
              `[SOCKET] Session not found for sessionId=${sessionId}`,
            );
            return;
          }
          if (extensionCount > 1) {
            session.end_time = now;
            await session.save();
          } else {
            if (!session.end_time || now < session.end_time) {
              logger.info(
                `[SOCKET] Updating session end_time to now: ${now.toISOString()} for sessionId=${sessionId}`,
              );
              session.end_time = now;
              await session.save();
            } else {
              logger.info(
                `[SOCKET] End time already passed, not updating end_time for sessionId=${sessionId}`,
              );
            }
          }
          logger.info(
            `[SOCKET] finalizeSession completed for sessionId=${sessionId}`,
          );

          const isAstrologer =
            userId.toString() === session.astrologer_user_id.toString();
              console.log(`User ${userId} is ${isAstrologer ? "Astrologer" : "User"} for session ${sessionId}`);
          const statusReason = isAstrologer
            ? Enums.SERVICE.STATUS_REASON.COMPLETED.ASTROLOGER_ENDED
            : Enums.SERVICE.STATUS_REASON.COMPLETED.USER_ENDED;
          await finalizeSession(sessionId, userId, statusReason);
        } catch (err) {
          logger.error(
            "[SOCKET] chat_session_end background finalize error:",
            err,
          );
        }
      })();
    } catch (err) {
      logger.error("[SOCKET] chat_session_end error:", err);
      return emitSocketError(
        socket,
        "chat_end_error",
        "Failed to end session.",
      );
    }
  });
  socket.on("chat_session_rejoin", async ({ sessionId }, callback) => {
    try {
      const { getSession } = require("../../utils/redis/sessionCacheService");

      const session = await getSession(sessionId);
      if (!session || session.status !== Enums.SERVICE.STATUS.ONGOING) {
        return callback?.({
          success: false,
          message: "Invalid or inactive session.",
        });
      }

      // IMPORTANT: Mark the user as IN-SESSION
      await setInSession(sessionId, userId, true);
      logger.info(
        `[SessionFlag] sessionId=${sessionId} userId=${userId} inSession set to TRUE (rejoin)`,
      );

      const now = new Date();
      const remainingMs = new Date(session.end_time) - now;
      if (remainingMs <= 0) {
        return callback?.({
          success: false,
          message: "Session already expired.",
        });
      }

      const remainingMinutes = Math.max(0, Math.floor(remainingMs / 60000));

      const payload = {
        astrologerId: session.astrologer_user_id,
        astrologer_id: session.astrologer_id,
        sessionId: session._id,
        chatId: session.chat_id,
        duration: remainingMinutes,
        ratePerMinute: session.rate_per_minute,
        totalAmount: session.total_amount,
        startTime: session.start_time,
        endTime: session.end_time,
        timestamp: Date.now(),
        message: "Session rejoined successfully.",
      };
      socketManager.io
        .to(`user_${session.user_id}`)
        .emit("chat_session_rejoined", payload);
      socketManager.io
        .to(`user_${session.astrologer_user_id}`)
        .emit("chat_session_rejoined", payload);
      callback?.({ success: true, session: payload });
    } catch (err) {
      logger.error("[SOCKET] chat_session_rejoin error:", err);
      return callback?.({
        success: false,
        message: "Failed to rejoin session.",
      });
    }
  });
  socket.on("kundli_activity", async ({ sessionId, activity, tab }) => {
    try {
      const { getSession } = require("../../utils/redis/sessionCacheService");
      const CacheService = require("../../utils/redis/cacheService");
      if (role !== Enums.USER.ROLE.ASTROLOGER) return;
      const session = await getSession(sessionId);
      if (!session || session.status !== Enums.SERVICE.STATUS.ONGOING) return;
      const userId = session.user_id.toString();
      let message = "Astrologer is reviewing your Kundli";
      if (tab) {
        message = `Astrologer is reviewing your ${tab} chart`;
      }
      const userSockets = socketManager.userSockets.get(userId);
      if (!userSockets) return;
      const redisKey = `kundli:user:${userId}:D1`;
      let d1Chart;
      if (activity === "START") {
        d1Chart = await CacheService.get(redisKey);
      }

      for (const sockId of userSockets) {
        socketManager.io.to(sockId).emit("kundli_activity", {
          sessionId,
          activity,
          tab,
          message,
          ...(activity === "START" && d1Chart ? { d1Chart } : {}),
          timestamp: Date.now(),
        });
      }

      logger.info(
        `[SOCKET] kundli_activity → ${activity} (${tab}) session=${sessionId}`,
      );
    } catch (err) {
      logger.error("[SOCKET] kundli_activity error", err);
    }
  });
  socket.on("is_session_active", async ({ sessionId }, callback) => {
    logger.info(
      `[SOCKET] is_session_active called for sessionId=${sessionId} by userId=${userId}`,
    );
    try {
      const { getSession } = require("../../utils/redis/sessionCacheService");
      const session = await getSession(sessionId);
      logger.info(
        `[SOCKET] Fetched session from cache: ${JSON.stringify(session)}`,
      );
      if (!session) {
        return callback?.({
          success: true,
          isActive: false,
          isMember: false,
        });
      }
      const isMember = [
        session.user_id?.toString(),
        session.astrologer_user_id?.toString(),
      ].includes(userId.toString());
      if (!isMember) {
        logger.warn(
          `[SOCKET] User ${userId} is not member of sessionId=${sessionId}`,
        );
        return callback?.({
          success: true,
          isActive: false,
          isMember: false,
        });
      }
      const isActive = session.is_active === true;
      return callback?.({
        success: true,
        isActive,
        isMember: true,
      });
    } catch (err) {
      logger.error("[SOCKET] is_session_active error:", err);
      return callback?.({
        success: false,
        error: "Failed to check session status",
      });
    }
  });
}
module.exports = handleChatRequestEvents;
