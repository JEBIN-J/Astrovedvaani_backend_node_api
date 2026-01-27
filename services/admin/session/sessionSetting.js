const SessionSetting = require('../../../models/SessionSetting');
const User = require('../../../models/User');
const Enums = require('../../../utils/constants');
const logger = require('../../../utils/logger');
const CacheService = require('../../../utils/redis/cacheService');
const CACHE_KEY = CacheService.CACHE_PREFIXES.SESSION_SETTING;
const TTL = CacheService.TTL.DEFAULT;

async function getSessionSetting() {
  try {
    const cached = await CacheService.get(CACHE_KEY);
    if (cached) return cached;

    const setting = await SessionSetting.findOne({ isActive: true }).lean();
    if (setting) {
      await CacheService.set(CACHE_KEY, setting, TTL);
    }

    return setting;
  } catch (err) {
    console.error('Error getting session setting:', err);
    throw err;
  }
}
async function upsertSessionSetting(data) {
  try {
    await SessionSetting.updateMany({ isActive: true }, { isActive: false });

    const newSetting = new SessionSetting({
      ...data,
      isActive: true,
    });

    await newSetting.save();

    await CacheService.clearMatchingKeys(CACHE_KEY);

    return newSetting;
  } catch (err) {
    console.error('Error upserting session setting:', err);
    throw err;
  }
}
async function checkFreeSessionEligibility(user) {
  if (!user) {
    logger.info(`checkFreeSessionEligibility: No user provided`);
    throw new Error('User is required');
  }
  logger.info(`checkFreeSessionEligibility: Checking eligibility for user ${user._id} with role ${user.role}`);

  const setting = await getSessionSetting();
  logger.info(`checkFreeSessionEligibility: Retrieved session setting ${JSON.stringify(setting)}`);

  if (!setting || !setting.enableFreeSession) {
    logger.info(`checkFreeSessionEligibility: Free session is disabled`);
    return { eligible: false, reason: 'Free session is disabled' };
  }

  if (!setting.eligibleRolesForFreeSession.includes(user.role)) {
    logger.info(`checkFreeSessionEligibility: User role ${user.role} not eligible for free session`);
    return { eligible: false, reason: 'Role not eligible for free session' };
  }

  const used = user.freeSessionUsed || 0;
  const lastUsedAt = user.lastFreeSessionUsedAt;
  const maxAllowed = setting.maxFreeSessionsPerUser;

  logger.info(`checkFreeSessionEligibility: User has used ${used}/${maxAllowed} free sessions`);

  if (used >= maxAllowed) {
    if (setting.freeSessionUsageInterval === Enums.SESSION_INTERVAL.LIFETIME) {
      logger.info(`checkFreeSessionEligibility: Free session usage limit reached (lifetime)`);
      return { eligible: false, reason: 'Free session already used' };
    }

    const now = new Date();
    if (!lastUsedAt) {
      logger.info(`checkFreeSessionEligibility: No previous usage date, user eligible`);
    } else {
      const diffMs = now - new Date(lastUsedAt);
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      const intervalType = setting.freeSessionUsageInterval;

      const allowReset =
        (intervalType === Enums.SESSION_INTERVAL.DAILY && diffDays >= 1) ||
        (intervalType === Enums.SESSION_INTERVAL.WEEKLY && diffDays >= 7) ||
        (intervalType === Enums.SESSION_INTERVAL.MONTHLY && diffDays >= 30);

      logger.info(`checkFreeSessionEligibility: Days since last free session ${diffDays}, intervalType ${intervalType}, allowReset=${allowReset}`);

      if (!allowReset) {
        logger.info(`checkFreeSessionEligibility: Free session recently used, not eligible`);
        return { eligible: false, reason: 'Free session recently used' };
      }
    }
  }

  // // Increment free session usage
  // const updatedUser = await User.findByIdAndUpdate(
  //   user._id,
  //   {
  //     $inc: { freeSessionUsed: 1 },
  //     $set: { lastFreeSessionUsedAt: new Date() }
  //   },
  //   { new: true }
  // );

  // logger.info(`checkFreeSessionEligibility: User ${user._id} eligible for free session, incremented usage. Current count: ${updatedUser.freeSessionUsed}`);

  return {
    eligible: true,
    duration: setting.freeSessionMinutes || 2,
  };
}
async function rollbackFreeSessionUsage(userId, previousLastUsedAt) {
  try {
    if (!userId) return;
    const user = await User.findById(userId);
    if (!user) return;
    const used = user.freeSessionUsed || 0;
    if (used <= 0) return;
    await User.findByIdAndUpdate(userId, {
      $inc: { freeSessionUsed: -1 },
      $set: { lastFreeSessionUsedAt: previousLastUsedAt || null },
    });

    logger.info(`rollbackFreeSessionUsage: Rolled back free session for user ${userId}. Previous count: ${used}, new count: ${used - 1}, lastFreeSessionUsedAt restored to ${previousLastUsedAt}`);
  } catch (err) {
    logger.error(`rollbackFreeSessionUsage: Error rolling back free session for user ${userId}`, err);
  }
}

module.exports = {
  getSessionSetting,
  upsertSessionSetting,
  checkFreeSessionEligibility,
  rollbackFreeSessionUsage
};