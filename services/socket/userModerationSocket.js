const logger = require("../../utils/logger");

let io = null;
let userSockets = null;

function registerModerationSocketManager(socketManager) {
  if (!socketManager?.io || !socketManager?.userSockets) {
    logger.warn("[ModerationSocket] socketManager missing");
    return;
  }

  io = socketManager.io;
  userSockets = socketManager.userSockets;

  logger.info("[ModerationSocket] Registered successfully");
}

function forceLogoutUser(userId, reason = "Policy violation") {
  try {
    if (!io) {
      logger.warn("[FORCE LOGOUT] SocketManager not initialized");
      return;
    }

    const room = `user_${userId}`;

    logger.warn(`[FORCE LOGOUT] Emitting to room=${room}`);

    // ✅ Emit to ALL sockets of user
    io.to(room).emit("force_logout", {
      reason,
      tokenExpired: true,
    });

    // ✅ Disconnect all sockets in room
    const sockets = io.sockets.adapter.rooms.get(room);

    if (!sockets || sockets.size === 0) {
      logger.warn(`[FORCE LOGOUT] No sockets found in room=${room}`);
      return;
    }

    for (const socketId of sockets) {
      const sock = io.sockets.sockets.get(socketId);

      if (sock) {
        logger.warn(`[FORCE LOGOUT] Disconnecting socketId=${socketId}`);
        sock.disconnect(true);
      }
    }

    logger.warn(`[FORCE LOGOUT] Completed for user=${userId}`);
  } catch (err) {
    logger.error("[FORCE LOGOUT] Error:", err);
  }
}

module.exports = {
  registerModerationSocketManager,
  forceLogoutUser,
};