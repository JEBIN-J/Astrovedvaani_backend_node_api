const logger = require('../../utils/logger');
const User = require('../../models/User');
let io = null;
function registerLiveSocketManager(socketManager) {
  if (!socketManager?.io) {
    logger.warn('[LIVE_SOCKET] socketManager.io not found');
    return;
  }
  io = socketManager.io;
  logger.info('[LIVE_SOCKET] Live Socket Manager registered');
}

function emitToUser(userId, event, payload) {
  if (!io) {
    logger.warn(`[LIVE_SOCKET] emitToUser: io not initialized | userId=${userId}`);
    return;
  }

  logger.info(`[LIVE_SOCKET] Emitting "${event}" to user ${userId}`);
  io.to(`user_${userId}`).emit(event, payload);
}

function joinLiveRoom(userId, sessionId) {
  if (!io || !sessionId) return;
  const room = `live_${sessionId}`;
  logger.info(`[LIVE_SOCKET] User ${userId} joining room ${room}`);
  io.to(`user_${userId}`).socketsJoin(room);
}

function leaveLiveRoom(userId, sessionId) {
  if (!io || !sessionId) return;
  const room = `live_${sessionId}`;
  logger.info(`[LIVE_SOCKET] User ${userId} leaving room ${room}`);
  io.to(`user_${userId}`).socketsLeave(room);
}

function emitLiveComment({ sessionId, userId, text, attendees, astrologerUserId, name, profilePicture }) {
  if (!sessionId || !attendees?.length) return;

  logger.info(`[LIVE_SOCKET] Emitting comment from user ${userId} in session ${sessionId}`);
  io.to(`user_${astrologerUserId}`).emit('live_comment_received', {
    sessionId,
    userId,
    name,
    profilePicture,
    text,
    timestamp: Date.now()
  });
  attendees.forEach(att => {
    if (att.user_id === userId) return;
    emitToUser(att.user_id, 'live_comment_received', {
      sessionId,
      userId,
      name,
      profilePicture,
      text,
      timestamp: Date.now()
    });
  });
}


function emitUserJoined({ sessionId, userId, astrologerUserId, totalViewers }) {
  logger.info(`[LIVE_SOCKET] User ${userId} joined session ${sessionId} | totalViewers=${totalViewers}`);
  emitToUser(astrologerUserId, 'live_user_joined', {
    sessionId,
    userId,
    totalViewers,
    message: `User ${userId} joined your live session.`,
    timestamp: Date.now()
  });
}

function emitUserLeft({ sessionId, userId, astrologerUserId, totalViewers }) {
  logger.info(`[LIVE_SOCKET] User ${userId} left session ${sessionId} | totalViewers=${totalViewers}`);
  emitToUser(astrologerUserId, 'live_user_left', {
    sessionId,
    userId,
    totalViewers,
    message: `User ${userId} left your live session.`,
    timestamp: Date.now()
  });
}

function emitLiveEnded({ sessionId, attendees }) {
  if (!attendees?.length) return;
  logger.info(`[LIVE_SOCKET] Live session ${sessionId} ended, notifying attendees`);
  attendees.forEach(att => {
    emitToUser(att.user_id, 'live_ended', {
      sessionId,
      message: 'Live session ended by astrologer'
    });
  });
}

async function emitGiftSent({ sessionId, userId, astrologerUserId, userGift }) {
  if (!sessionId || !userGift) return;
  await userGift.populate('gift_id');
  const gift = userGift.gift_id;
  const sender = await User.findById(userId).select('name profilePicture');
  if (!sender) {
    logger.warn(`[LIVE_SOCKET] emitGiftSent: sender user not found | userId=${userId}`);
    return;
  }
  const payload = {
    sessionId,
    userId,
    name: sender.name,
    profilePicture: sender.profilePicture || null,
    astrologerUserId,
    giftId: gift._id,
    giftName: gift.name,
    giftImageUrl: gift.imageUrl,
    giftPrice: userGift.price,
    timestamp: Date.now(),
    message: `${sender.name} sent a gift (${gift.name})`
  };

  logger.info(`[LIVE_SOCKET] Emitting gift sent from user ${userId} to astrologer ${astrologerUserId} in session ${sessionId}`);

  emitToUser(astrologerUserId, 'gift_received', payload);

  io.to(`live_${sessionId}`).emit('gift_sent', payload);
}

function emitIntegrationBroadcast(event, payload) {
  if (!io) {
    logger.warn('[LIVE_SOCKET] emitIntegrationBroadcast: io not initialized');
    return;
  }
  logger.info(`[LIVE_SOCKET] Broadcasting "${event}" to ALL users`);
  io.emit(event, payload);
}



module.exports = {
  registerLiveSocketManager,
  joinLiveRoom,
  leaveLiveRoom,
  emitLiveComment,
  emitUserJoined,
  emitUserLeft,
  emitLiveEnded,
  emitGiftSent,
  emitIntegrationBroadcast
};
