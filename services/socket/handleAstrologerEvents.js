const socketManager = require('../../config/socket');
const logger = require('../../utils/logger');

function emitAstrologerAvailability(payload) {
  const { io } = socketManager;
  if (!io) {
    logger.warn('[AstroSocket] Socket.IO not initialized. Cannot emit status update.');
    return;
  }
  io.to('users').emit('astrologer_status_updated', payload);
  io.to('admins').emit('astrologer_status_updated', payload);
  logger.info('[AstroSocket] Emitted astrologer_status_updated to users and admins', payload);
}

module.exports = {
  emitAstrologerAvailability,
};
