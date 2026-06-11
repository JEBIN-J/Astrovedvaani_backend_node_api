const redis = require("./redisClient");
const Enums = require("../constants");
const logger = require("../logger");

const TTL_MAP = {
  [Enums.USER.ROLE.USER]: 60 * 60 * 6,
  [Enums.USER.ROLE.ASTROLOGER]: 60 * 60 * 1,
  [Enums.USER.ROLE.VENDOR]: 60 * 60 * 6,
};

async function updateUserActivity(
  userId,
  role,
  eventType = "CONNECT", // "CONNECT" | "DISCONNECT"
  source = "UNKNOWN"
) {
  try {
    if (!userId || !role) return;
    if (role === Enums.USER.ROLE.ADMIN) return;

    const ttl = TTL_MAP[role];
    if (!ttl) return;

    const key = `activity:${userId}`;

    let data = {
      role,
      connectTime: 0,
      disconnectTime: 0,
      source,
    };

    const existing = await redis.get(key);

    if (existing) {
      data = JSON.parse(existing);
    }

    data.role = role;
    data.source = source;

    const now = Date.now();

    if (eventType === "CONNECT") {
      data.connectTime = now;
      if (!data.disconnectTime) {
        data.disconnectTime = 0;
      }
    }

    if (eventType === "DISCONNECT") {
      data.disconnectTime = now;
      if (!data.connectTime) {
        data.connectTime = 0;
      }
    }

    await redis.set(
      key,
      JSON.stringify(data),
      "EX",
      ttl
    );

    logger.info(
      `[ACTIVITY] ${eventType} userId=${userId} connectTime=${data.connectTime} disconnectTime=${data.disconnectTime}`
    );
  } catch (err) {
    logger.error(
      `[ACTIVITY] ERROR userId=${userId}`,
      err
    );
  }
}

async function getUserActivity(userId) {
  try {
    const key = `activity:${userId}`;

    const data = await redis.get(key);

    if (!data) return null;

    const parsed = JSON.parse(data);

    return {
      ...parsed,
      isActive:
        (parsed.connectTime || 0) >
        (parsed.disconnectTime || 0),
    };
  } catch (err) {
    logger.error(
      `[ACTIVITY] GET ERROR userId=${userId}`,
      err
    );
    return null;
  }
}

module.exports = {
  updateUserActivity,
  getUserActivity,
};