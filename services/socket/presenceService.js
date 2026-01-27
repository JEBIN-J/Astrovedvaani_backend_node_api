const logger = require('../../utils/logger');

module.exports = (socketManager, socket) => {
  const { userId, role } = socket.user;

  socket.on('set_availability', (isAvailable) => {
    if (role !== 101) {
      logger.warn(`Non-astrologer ${userId} attempted to set availability`);
      return socket.emit('error', { message: 'Only astrologers can set availability' });
    }

    if (isAvailable) {
      socketManager.onlineAstrologers.add(userId);
    } else {
      socketManager.onlineAstrologers.delete(userId);
    }

    socketManager.broadcastOnlineLists();
    logger.info(`Astrologer ${userId} availability set to ${isAvailable}`);
  });

  // Heartbeat/ping mechanism
  let heartbeatInterval;
  const setupHeartbeat = () => {
    heartbeatInterval = setInterval(() => {
      socket.emit('ping', { timestamp: Date.now() });
    }, 30000); // 30 seconds

    socket.on('pong', () => {
      logger.debug(`Heartbeat received from ${userId}`);
    });
  };

  setupHeartbeat();

  socket.on('disconnect', () => {
    clearInterval(heartbeatInterval);
  });
};