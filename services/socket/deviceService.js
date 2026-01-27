const logger = require("../../utils/logger");

function handleDeviceEvents(socketManager, socket) {
  const { io, userSockets } = socketManager;
  if (!socket.user) return;
  const { userId, sessionId, deviceId } = socket.user;
  if (!userSockets.has(userId)) {
    userSockets.set(userId, new Set());
  }
  const existingSockets = userSockets.get(userId);
  for (const entry of existingSockets) {
    if (entry.sessionId === sessionId && entry.deviceId === deviceId) {
      continue;
    }
    const oldSocket = io.sockets.sockets.get(entry.socketId);
    if (oldSocket) {
      logger.warn(
        `[FORCE LOGOUT] user=${userId}, oldSession=${entry.sessionId}, newSession=${sessionId}`,
      );
      oldSocket.emit("force_logout", {
        reason: "Logged in from another device",
        tokenExpired: true,
      });
      oldSocket.disconnect(true);
    }
  }
  existingSockets.add({
    socketId: socket.id,
    sessionId,
    deviceId,
  });
  socket.on("disconnect", () => {
    const sockets = userSockets.get(userId);
    if (!sockets) return;
    for (const entry of sockets) {
      if (entry.socketId === socket.id) {
        sockets.delete(entry);
        break;
      }
    }
    if (sockets.size === 0) {
      userSockets.delete(userId);
    }
  });
}
module.exports = { handleDeviceEvents };
