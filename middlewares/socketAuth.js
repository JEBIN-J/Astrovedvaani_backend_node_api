const { verifyAccessToken } = require('../utils/jwtService');
const logger = require('../utils/logger');
const Enums = require('../utils/constants');
const User = require('../models/User');
const Astrologer = require('../models/Astrologer');
const validateUserStatus = require('./validateUserStatus');
const { updateUserActivity } = require('../utils/redis/activity.service');

module.exports = async (socket, next) => {
  const token =
    socket.handshake.auth?.accessToken ||
    socket.handshake.query?.token;
  if (!token) {
    logger.error('[SOCKET AUTH] No token received from client');
    return next(new Error('Authentication token required'));
  }
  let decoded;
  try {
    decoded = await verifyAccessToken(token);
  } catch (err) {
    logger.error(`[SOCKET AUTH] Token verification failed: ${err.message}`);
    return next(new Error('Invalid or expired token'));
  }
  const userId = decoded._id;
  try {
    await validateUserStatus(userId);
  } catch (err) {
    logger.warn(`[SOCKET AUTH] User validation failed: ${err.message}`);
    return next(new Error(err.message));
  }
  const user = await User.findById(userId)
    .select('name role email mobileNumber');
  if (!user) {
    logger.warn(`[SOCKET AUTH] User not found in DB: ${userId}`);
    return next(new Error('User not found'));
  }
  socket.user = {
    userId: userId.toString(),
    role: user.role,
    name: user.name || `User-${userId.toString().slice(0, 5)}`,
    sessionId: decoded.sessionId,
    deviceId: decoded.deviceId,
  };
  logger.info(
    `[SOCKET AUTH] User authenticated | userId=${userId} | role=${user.role}`
  );
  if (user.role === Enums.USER.ROLE.ASTROLOGER) {
    const astrologer = await Astrologer.findOne({ user_id: userId })
      .select('display_name is_busy is_online');
    if (astrologer) {
      logger.info(
        `[SOCKET AUTH] Astrologer Info: ${astrologer.display_name} | busy=${astrologer.is_busy}`
      );
    } else {
      logger.warn(
        `[SOCKET AUTH] No astrologer profile found for userId=${userId}`
      );
    }
  }
  await updateUserActivity(
    userId.toString(),
    user.role,
    'SOCKET_CONNECT'
  );
  next();
};