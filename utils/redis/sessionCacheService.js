const Astrologer = require("../../models/Astrologer");
const User = require("../../models/User");
const { emitAstrologerAvailability } = require("../../services/socket/handleAstrologerEvents");
const logger = require("../logger");
const CacheService = require("./cacheService");
const SESSION_PREFIX = "session:active";
const ASTRO_BUSY_PREFIX = "astrologer:busy:";
const USER_PREFIX = "user:info";
const redis = require("./redisClient");

async function saveSession(sessionId, sessionData, ttl = 60 * 60) {
  if (!sessionId || !sessionData) {
    throw new Error("Session ID and data are required to save session in cache");
  }
  const key = `${SESSION_PREFIX}:${sessionId}`;
  try {
    logger.info(`[SessionCache] Saving session with key=${key}, ttl=${ttl}`);
    logger.debug(`[SessionCache] Session data to save: ${JSON.stringify(sessionData)}`); // <--- NEW

    await CacheService.set(key, sessionData, ttl);

    if (sessionData.astrologer_user_id) {
      const busyKey = `${ASTRO_BUSY_PREFIX}${sessionData.astrologer_user_id}`;
      await CacheService.set(busyKey, sessionId, ttl);
      logger.info(`[SessionCache] Marked astrologer ${sessionData.astrologer_user_id} as busy`);
      logger.debug(`[SessionCache] Busy key=${busyKey} => sessionId=${sessionId}`); // <--- NEW
    }

    logger.info(`[SessionCache] Saved session ${sessionId} in Redis (TTL=${ttl}s)`);
  } catch (err) {
    logger.error(`[SessionCache] Failed to save session ${sessionId} in Redis: ${err.message}`);
  }
}

async function updateSession(sessionId, newData, ttl = 60 * 60) {
  if (!sessionId || !newData || typeof newData !== "object") return null;
  try {
    logger.info(`[SessionCache] Overwriting session ${sessionId} with new data: ${JSON.stringify(newData)}`);
    await saveSession(sessionId, newData, ttl);
    return newData;
  } catch (err) {
    logger.error(`[SessionCache] Failed to update session ${sessionId} in Redis: ${err.message}`);
    return null;
  }
}
async function clearSession(sessionId) {
  if (!sessionId) return;
  const key = `${SESSION_PREFIX}:${sessionId}`;

  try {
    logger.info(`[SessionCache] Attempting to clear sessionId=${sessionId}`);
    const session = await getSession(sessionId);

    logger.debug(`[SessionCache] Session fetched for clearing: ${JSON.stringify(session)}`); // <--- NEW

    if (session?.astrologer_user_id) {
      const busyKey = `${ASTRO_BUSY_PREFIX}${session.astrologer_user_id}`;

      // Delete busy flag key
      await CacheService.del(busyKey);
      logger.info(`[SessionCache] Deleted busy flag key=${busyKey} for astrologer ${session.astrologer_user_id}`);

      // Emit event
      emitAstrologerAvailability({
        astrologer_user_id: session.astrologer_user_id,
        is_busy: false,
      });

      ///

      // --- Notify all waiting users ---
    const { getAndClearBusyWaitList } = require("./sessionCacheService");
    const sendPushNotification = require("../../services/notification/sendNotification");

    const waitingUsers = await getAndClearBusyWaitList(session.astrologer_user_id);

    if (waitingUsers.length > 0) {
      logger.info(`[NOTIF] Notifying ${waitingUsers.length} users that astrologer ${session.astrologer_user_id} is FREE`);

      for (const userId of waitingUsers) {
        await sendPushNotification(
          userId,
          "🌟 Astrologer Now Available",
          "Your astrologer is free now. Start your session!",
          { type: "ASTRO_FREE", astrologerId: session.astrologer_user_id }
        );
      }
    }

      logger.info(`[SessionCache] Emitted availability for astrologer ${session.astrologer_user_id}`);
    } else {
      logger.warn(`[SessionCache] No astrologer_user_id found in session ${sessionId}, cannot clear busy flag`); // <--- NEW
    }

    // Delete session key
    await CacheService.del(key);
    logger.info(`[SessionCache] Cleared session ${sessionId} (key=${key}) from Redis`);

  } catch (err) {
    logger.error(`[SessionCache] Failed to clear session ${sessionId} from Redis: ${err.message}`);
  }
}

async function getSession(sessionId) {
  if (!sessionId) return null;
  const key = `${SESSION_PREFIX}:${sessionId}`;
  try {
    logger.info(`[SessionCache] Fetching session for key=${key}`);
    const session = await CacheService.get(key);
    logger.debug(`[SessionCache] Raw session from Redis for ${key}: ${JSON.stringify(session)}`); // <--- NEW
    return session;
  } catch (err) {
    logger.error(`[SessionCache] Failed to fetch session ${sessionId} from Redis: ${err.message}`);
    return null;
  }
}

async function checkAstrologerBusy(astrologerUserId) {
  if (!astrologerUserId) return false;
  try {
    const busyKey = `${ASTRO_BUSY_PREFIX}${astrologerUserId}`;
    const busySession = await CacheService.get(busyKey);
    logger.info(`[SessionCache] Busy check for astrologer ${astrologerUserId}: ${busySession ? "BUSY" : "FREE"}`);
    return !!busySession;
  } catch (err) {
    logger.error(`[SessionCache] Error checking busy status for astrologer ${astrologerUserId}: ${err.message}`);
    return false;
  }
}

async function saveUser(userId, userData, ttl = 60 * 60 * 24) {
  if (!userId || !userData) throw new Error("User ID and data are required");

  try {
    logger.info(`[UserCache] saveUser called for userId=${userId}`);

    if (userData.role === 101) {
      logger.info(`[UserCache] User role is 101, fetching astrologer info for display_name`);
      const astrologer = await Astrologer.findOne({ user_id: userId });
      if (astrologer) {
        userData.display_name = astrologer.display_name || 'UNKNOWN';
        logger.info(`[UserCache] Set display_name from astrologer: ${userData.display_name}`);
      } else {
        userData.display_name = userData.name || 'UNKNOWN';
      }
    }

    const key = `${USER_PREFIX}:${userId}`;
    logger.info(`[UserCache] Saving user info with key=${key}, ttl=${ttl}`);
    await CacheService.set(key, userData, ttl);
    logger.debug(`[UserCache] User data saved: ${JSON.stringify(userData)}`);
  } catch (err) {
    logger.error(`[UserCache] Failed to save user ${userId} info: ${err.message}`);
  }
}


async function getUser(userId) {
  if (!userId) {
    logger.info(`[UserCache] getUser called with empty userId`);
    return null;
  }

  const key = `${USER_PREFIX}:${userId}`;
  try {
    logger.info(`[UserCache] Fetching user with key=${key} from cache`);
    let user = await CacheService.get(key);

    if (!user) {
      logger.info(`[UserCache] Cache miss for user ${userId}, fetching from DB`);
      user = await User.findById(userId);
      if (user) {
        logger.info(`[UserCache] User fetched from DB, saving to cache`);
        await saveUser(userId, user);
      } else {
        logger.info(`[UserCache] User not found in DB for userId=${userId}`);
      }
    } else {
      logger.debug(`[UserCache] Fetched user data from cache for ${userId}, user=${JSON.stringify(user)}`);
    }

    return user;
  } catch (err) {
    logger.error(`[UserCache] Failed to fetch user ${userId}: ${err.message}`);
    return null;
  }
}


/** new fucntion  */

async function addUserToBusyWaitList(astrologerId, userId) {
  const key = `busy_waiting_users:${astrologerId}`;
  await redis.sadd(key, userId.toString());
}

async function getAndClearBusyWaitList(astrologerId) {
  const key = `busy_waiting_users:${astrologerId}`;
  const users = await redis.smembers(key);
  await redis.del(key);
  return users;
}


module.exports = {
  saveSession,
  updateSession,
  clearSession,
  getSession,
  checkAstrologerBusy,
  saveUser,
  getUser,
  addUserToBusyWaitList,
  getAndClearBusyWaitList
};
