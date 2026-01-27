const logger = require("../logger");
const redisClient = require("./redisClient");

const CACHE_PREFIXES = {
  USERS_LIST: 'users:list',
  ASTROLOGERS_BATCH: 'astrologers:batch',
  SERVICE_RATES: 'serviceRates:batch',
  USER_DETAILS: 'user:details',
  ASTROLOGERS_LIST: 'astro:list',
  SESSION_SETTING: 'sessionSetting:active',
};

const TTL = {
  DEFAULT: 60 * 5,
  ASTROLOGER: 60 * 2,
  SERVICE_RATES: 60 * 15,
};

class CacheService {
  static CACHE_PREFIXES = CACHE_PREFIXES;
  static TTL = TTL;

  static async get(key) {
    try {
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (err) {
      logger.error("Cache read error:", err);
      return null;
    }
  }

  static async set(key, value, ttl = TTL.DEFAULT) {
    try {
      await redisClient.setEx(key, ttl, JSON.stringify(value));
    } catch (err) {
      logger.error("Cache write error:", err);
    }
  }

  static generateKey(prefix, ...args) {
    return `${prefix}:${args.map(arg => JSON.stringify(arg)).join(":")}`;
  }

  static async clearMatchingKeys(prefix) {
    try {
      const pattern = `${prefix}*`;
      const keys = await redisClient.client.keys(pattern);
      if (keys.length) {
        await redisClient.client.del(keys);
        logger.info(`Cleared ${keys.length} keys matching: ${pattern}`);
      }
    } catch (err) {
      logger.error("Cache bulk delete error:", err);
    }
  }

  static async clearUserRelatedCaches(userId) {
    try {
      await this.clearMatchingKeys(CACHE_PREFIXES.USERS_LIST);
      await this.clearMatchingKeys(CACHE_PREFIXES.ASTROLOGERS_BATCH);
      await this.clearMatchingKeys(CACHE_PREFIXES.ASTROLOGERS_LIST);
      await this.clearMatchingKeys(`${CACHE_PREFIXES.SERVICE_RATES}:${userId}`);
      await this.clearMatchingKeys(`${CACHE_PREFIXES.USER_DETAILS}:${userId}`);
    } catch (err) {
      logger.error("User cache clearing error:", err);
    }
  }
  static async del(key) {
    try {
      await redisClient.del(key);
    } catch (err) {
      logger.error("Cache delete error:", err);
    }
  }
  static async markAstrologerBusy(astrologerId, sessionId, ttl = 60 * 60) { // 1h
    const key = `astro:busy:${astrologerId}`;
    try {
      await redisClient.setEx(key, ttl, sessionId);
      logger.info(`[CacheService] Marked astrologer ${astrologerId} as BUSY for session ${sessionId} (TTL=${ttl}s)`);
      return true;
    } catch (err) {
      logger.error("[CacheService] Error marking astrologer busy:", err);
      return false;
    }
  }

  static async clearAstrologerBusy(astrologerId) {
    const key = `astro:busy:${astrologerId}`;
    try {
      await redisClient.del(key);
      logger.info(`[CacheService] Cleared BUSY status for astrologer ${astrologerId}`);
      return true;
    } catch (err) {
      logger.error("[CacheService] Error clearing astrologer busy:", err);
      return false;
    }
  }

  static async isAstrologerBusy(astrologerId) {
    const key = `astro:busy:${astrologerId}`;
    try {
      const sessionId = await redisClient.get(key);
      if (sessionId) {
        logger.info(`[CacheService] Astrologer ${astrologerId} is BUSY (session ${sessionId})`);
      } else {
        logger.info(`[CacheService] Astrologer ${astrologerId} is FREE`);
      }
      return sessionId || null;
    } catch (err) {
      logger.error("[CacheService] Error checking astrologer busy:", err);
      return null;
    }
  }

    // ✅ ADD BELOW existing methods — DO NOT TOUCH ABOVE CODE

static async sadd(key, value) {
  try {
    // redisClient.client is already used elsewhere in this file
    await redisClient.client.sAdd(key, value);
  } catch (err) {
    logger.error("[CacheService] sadd error:", err);
  }
}

static async smembers(key) {
  try {
    return await redisClient.client.sMembers(key);
  } catch (err) {
    logger.error("[CacheService] smembers error:", err);
    return [];
  }
}
}
module.exports = CacheService;
