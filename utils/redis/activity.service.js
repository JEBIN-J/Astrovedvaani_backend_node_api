const redis = require("./redisClient");
const Enums = require("../constants");
const logger = require("../logger");

const TTL_MAP = {
  [Enums.USER.ROLE.USER]: 60 * 60 * 6,
  [Enums.USER.ROLE.ASTROLOGER]: 60 * 60 * 1,
  [Enums.USER.ROLE.VENDOR]: 60 * 60 * 6,
};

async function updateUserActivity(userId, role, source = "UNKNOWN") {
  try {
    if (!userId || !role) return;
    if (role === Enums.USER.ROLE.ADMIN) return;
    const ttl = TTL_MAP[role];
    if (!ttl) return;
    const key = `activity:${userId}`;
    await redis.set(
      key,
      JSON.stringify({
        role,
        lastSeen: Date.now(),
        source,
      }),
      "EX",
      ttl
    );
    logger.info(
      `[ACTIVITY] UPDATED userId=${userId}, role=${role}, source=${source}`
    );
  } catch (err) {
    logger.error(`[ACTIVITY] Redis error userId=${userId}`, err);
  }
}

module.exports = {
  updateUserActivity,
};