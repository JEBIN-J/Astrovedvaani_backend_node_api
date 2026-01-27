const logger = require('../../utils/logger');

module.exports = (socketManager, socket) => {
  const { userId, role } = socket.user;
  socket.on('subscribe_to_astrologer', (astrologerId) => {
    if (role !== 100) return;
    if (socketManager.onlineAstrologers.has(astrologerId)) {
      socket.emit('astrologer_online', { astrologerId });
    }
  });

  socket.on('typing', ({ sessionId, isTyping }) => {
    socket.to(sessionId).emit('typing_indicator', {
      userId: socket.user.userId,
      isTyping
    });
  });

  socket.on('session_time_update', ({ sessionId, duration }) => {
    socket.to(sessionId).emit('session_time_update', { duration });
  });
};