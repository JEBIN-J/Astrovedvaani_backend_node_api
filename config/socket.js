const { Server } = require("socket.io");
const logger = require("../utils/logger");
const socketAuthMiddleware = require("../middlewares/socketAuth");
const handleChatRequestEvents = require("../services/socket/chatRequestService");
const chatServiceEvents = require("../services/socket/chatService");
const registerRejoinService = require("../services/socket/rejoinService");
const ConsultationSession = require("../models/ConsultationSession");
const Enums = require("../utils/constants");
const {
  registerPoojaSocketManager,
} = require("../services/socket/poojaSocket");
const {
  registerOrderSocketManager,
} = require("../services/socket/orderSocket");

const registerAgoraCallHandlers = require("../services/socket/agoraRequestService");
const { registerLiveSocketManager } = require("../services/socket/liveSocket");
const CacheService = require("../utils/redis/cacheService");
const {
  registerWalletSocketManager,
} = require("../services/socket/walletNotification");
const { setInSession, getInSession } = require("../utils/redis/sessionExtend");
const { handleDeviceEvents } = require("../services/socket/deviceService");
const {
  registerModerationSocketManager,
} = require("../services/socket/userModerationSocket");
const sendPushNotification = require("../services/notification/sendNotification");
const { updateUserActivity } = require("../utils/redis/activity.service");

class SocketManager {
  constructor() {
    this.io = null;
    this.userSockets = new Map();
    this.deviceSockets = new Map();
    this.onlineAstrologers = new Set();
    this.onlineUsers = new Set();
    this.onlineAdmins = new Set();
    this.activeSessions = new Map();
    this.disconnectTimeouts = new Map();
    this.sessionTimeouts = new Map();
  }

  initialize(server) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.CLIENT_URLS?.split(",") || [
          "http://localhost:5173",
        ],
        methods: ["GET", "POST"],
        credentials: true,
      },
      connectionStateRecovery: {
        maxDisconnectionDuration: 2 * 60 * 1000,
        skipMiddlewares: false,
      },
    });
    this.io.use(socketAuthMiddleware);
    registerPoojaSocketManager(this);
    registerOrderSocketManager(this);
    registerLiveSocketManager(this);
    registerWalletSocketManager(this);
    registerModerationSocketManager(this);
    this.io.on("connection", (socket) => {
      if (!socket.user) {
        logger.error(`[SOCKET] Unauthorized socket connection: ${socket.id}`);
        socket.emit("auth_error", {
          message: "Authentication required. Please login again.",
        });
        setTimeout(() => {
          socket.disconnect(true);
        }, 300);
        return;
      }

      const { userId, role } = socket.user;
      logger.info(
        `Socket connected: ${socket.id}, userId=${userId}, role=${role}`,
      );
      this.trackConnection(userId, socket.id, role);
      socket.join(`user_${userId}`);
      if (role === Enums.USER.ROLE.ASTROLOGER) socket.join("astrologers");
      else if (role === Enums.USER.ROLE.USER) socket.join("users");
      else if (role === Enums.USER.ROLE.ADMIN) socket.join("admins");
      handleChatRequestEvents(this, socket);
      registerAgoraCallHandlers(this, socket);
      chatServiceEvents(this, socket);
      registerRejoinService(this, socket);
      handleDeviceEvents(this, socket);
      this.broadcastOnlineLists();
      socket.on("disconnect", async () => {
        logger.info(
          `[DISCONNECT] Socket disconnected: ${socket.id} | userId=${userId}`,
        );
        const activeSession = this.getActiveSession(userId);
        logger.info(
          `[DISCONNECT] Active session: ${JSON.stringify(activeSession)}`,
        );
        this.cleanup(userId, socket.id, role);
        this.broadcastOnlineLists();
        if (!activeSession) return;
        const sessionId = activeSession.sessionId;
        const disconnectKey = `${sessionId}_${userId}`;
        logger.info(
          `[DISCONNECT] Starting 30s disconnect timeout for session ${sessionId}`,
        );
        await setInSession(sessionId, userId, false);
        if (this.disconnectTimeouts.has(disconnectKey)) {
          logger.info(`[DISCONNECT] Timeout already exists.`);
          return;
        }
        const stillConnected = this.deviceSockets?.get(userId)?.size > 0;
        if (stillConnected) {
          logger.info(
            "User reconnected on another device, skip disconnect handling",
          );
          return;
        }

        const timer = setTimeout(async () => {
          try {
            const {
              getSession,
              clearSession,
            } = require("../utils/redis/sessionCacheService");
            const session = await getSession(sessionId);
            if (!session || session.status !== Enums.SERVICE.STATUS.ONGOING) {
              logger.warn(`[TIMEOUT] No ongoing session ${sessionId}`);
              return;
            }

            if (session.mode === Enums.SERVICE.TYPE.CALL) {
              logger.info(
                `[TIMEOUT] Session ${sessionId} is a CALL, skipping auto-end on disconnect.`,
              );
              return;
            }
            const userIn = await getInSession(sessionId, session.user_id);
            const astroIn = await getInSession(
              sessionId,
              session.astrologer_user_id,
            );
            let stillDisconnected = false;
            if (session.user_id.toString() === userId.toString())
              stillDisconnected = !userIn;
            if (session.astrologer_user_id.toString() === userId.toString())
              stillDisconnected = !astroIn;
            logger.info(`[TIMEOUT] stillDisconnected=${stillDisconnected}`);
            if (!stillDisconnected) {
              logger.info(`[TIMEOUT] User returned to chat. Skip auto-end.`);
              return;
            }
            const now = new Date();
            const elapsed = now - new Date(session.start_time);
            const usedMinutes = Math.ceil(elapsed / 60000);
            const billableMinutes = Math.min(
              usedMinutes,
              session.duration_minutes,
            );
            const finalAmount = session.is_free
              ? 0
              : billableMinutes * session.rate_per_minute;
            console.log(
              `[TIMEOUT] Auto-ending session ${sessionId} after 30s disconnect. Billable minutes: ${billableMinutes}, final amount: ${finalAmount}`,
            );
            logger.info(`[TIMEOUT] Auto-ending session ${sessionId}`);
            const isAstrologer =
              userId.toString() === session.astrologer_user_id.toString();
            const statusReason = isAstrologer
              ? Enums.SERVICE.STATUS_REASON.COMPLETED.ASTROLOGER_NETWORK_ISSUE
              : Enums.SERVICE.STATUS_REASON.COMPLETED.USER_NETWORK_ISSUE;
            await ConsultationSession.findByIdAndUpdate(
              sessionId,
              {
                end_time: now,
                // completed_at: now,
                // forced_end_reason: `Participant ${userId} disconnected for too long`,
                // duration_minutes: billableMinutes,
                // total_amount: finalAmount,
                // payment_status: Enums.PAYMENT.STATUS.PAID,
                // status: Enums.SERVICE.STATUS.COMPLETED,
                // status_reason: statusReason,
              },
              { new: true },
            );
            await clearSession(sessionId);
            this.clearActiveSession(
              session.user_id.toString(),
              session.astrologer_id.toString(),
            );
            await CacheService.clearAstrologerBusy(session.astrologer_user_id);

            const timeouts = this.sessionTimeouts.get(sessionId);
            if (timeouts) {
              clearTimeout(timeouts.durationTimeout);
              clearTimeout(timeouts.finalTimeout);
            }

            this.sessionTimeouts.delete(sessionId);
            this.disconnectTimeouts.delete(disconnectKey);
            [session.user_id, session.astrologer_user_id].forEach((uid) => {
              const targetSocketIds = this.userSockets.get(uid.toString());
              if (targetSocketIds && targetSocketIds.size > 0) {
                logger.info(
                  `[TIMEOUT] Emitting chat_auto_completed to user_${uid}`,
                );
                this.io.to(`user_${uid}`).emit("chat_auto_completed", {
                  sessionId,
                  reason: "Chat ended due to disconnection timeout.",
                });
              } else {
                logger.info(
                  `[TIMEOUT] No active sockets for user_${uid}, sending push notification.`,
                );
                (async () => {
                  try {
                    const pushSent = await sendPushNotification(
                      uid,
                      "Chat Ended",
                      "Your chat session has ended due to disconnection timeout.",
                      {
                        type: "chat_auto_completed",
                        sessionId,
                        channelId: 1008,
                      },
                    );
                    logger.info(
                      `[SOCKET] Firebase push ${pushSent ? "succeeded" : "failed"} for user ${uid}`,
                    );
                  } catch (pushErr) {
                    logger.error(
                      `[SOCKET] Push notification failed for user ${uid}:`,
                      pushErr,
                    );
                  }
                })();
                logger.info(
                  `[TIMEOUT] No active sockets for user_${uid}, emitted push notification event.`,
                );
              }
            });
            logger.info(`[TIMEOUT] Auto-ended session ${sessionId}`);
            (async () => {
              try {
                const {
                  finalizeSession,
                } = require("../services/session/ledgerService");
                const result = await finalizeSession(
                  sessionId,
                  session.user_id,
                  statusReason,
                  "Auto-ended by system on disconnect",
                );
                console.log(
                  `[Ledger] finalizeSession result for ${sessionId}:`,
                  result,
                );
                if (!result.success)
                  logger.warn(
                    `[Ledger] Failed ledger for ${sessionId}: ${result.error}`,
                  );
                else
                  logger.info(
                    `[Ledger] Ledger created for session ${sessionId}`,
                  );
              } catch (err) {
                logger.error(`[Ledger] Error in ledger finalize:`, err);
              }
            })();
          } catch (err) {
            logger.error(
              `[TIMEOUT] Error auto-ending session ${sessionId}:`,
              err,
            );
          }
        }, 30000);
        this.disconnectTimeouts.set(disconnectKey, timer);
        await updateUserActivity(
          userId.toString(),
          role,
          "DISCONNECT",
          "SOCKET_DISCONNECT",
        );
      });

      socket.on("error", (err) => logger.error("Socket error:", err));
    });

    return this.io;
  }

  async handleReconnectSessionCheck(userId) {
    for (const [key, timeout] of Array.from(
      this.disconnectTimeouts.entries(),
    )) {
      if (!key.endsWith(`_${userId}`)) continue;
      const sessionId = key.split("_")[0];
      const isInSession = await getInSession(sessionId, userId);
      if (isInSession) {
        clearTimeout(timeout);
        this.disconnectTimeouts.delete(key);
        logger.info(
          `[RECONNECT] Cleared timeout — ${userId} REJOINED session ${sessionId}`,
        );
      } else {
        logger.info(
          `[RECONNECT] User ${userId} connected but NOT in session ${sessionId}`,
        );
      }
    }
  }

  trackConnection(userId, socketId, role) {
    userId = userId.toString();
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
      if (role === Enums.USER.ROLE.ASTROLOGER)
        this.onlineAstrologers.add(userId);
      else if (role === Enums.USER.ROLE.USER) this.onlineUsers.add(userId);
      else if (role === Enums.USER.ROLE.ADMIN) this.onlineAdmins.add(userId);
    }
    this.handleReconnectSessionCheck(userId).catch((err) =>
      logger.error(`[RECONNECT] Error`, err),
    );
    this.userSockets.get(userId).add(socketId);
  }

  cleanup(userId, socketId, role) {
    userId = userId.toString();
    const sockets = this.userSockets.get(userId);
    if (sockets) {
      sockets.delete(socketId);
      if (sockets.size === 0) {
        this.userSockets.delete(userId);
        if (role === Enums.USER.ROLE.ASTROLOGER)
          this.onlineAstrologers.delete(userId);
        else if (role === Enums.USER.ROLE.USER) this.onlineUsers.delete(userId);
        else if (role === Enums.USER.ROLE.ADMIN)
          this.onlineAdmins.delete(userId);
      }
    }
  }

  broadcastOnlineLists() {
    this.io
      .to("users")
      .emit("online_astrologers", Array.from(this.onlineAstrologers));
    this.io
      .to("astrologers")
      .emit("online_users", Array.from(this.onlineUsers));
    this.io.to("admins").emit("online_users", Array.from(this.onlineUsers));
    this.io
      .to("admins")
      .emit("online_astrologers", Array.from(this.onlineAstrologers));
  }

  getActiveSession(userId) {
    return this.activeSessions.get(userId.toString());
  }

  setActiveSession(userId, astrologerId, sessionId) {
    this.activeSessions.set(userId.toString(), {
      astrologerId: astrologerId.toString(),
      sessionId,
    });

    this.activeSessions.set(astrologerId.toString(), {
      userId: userId.toString(),
      sessionId,
    });
  }

  clearActiveSession(userId, astrologerId) {
    this.activeSessions.delete(userId.toString());
    this.activeSessions.delete(astrologerId.toString());
  }
}
module.exports = new SocketManager();
