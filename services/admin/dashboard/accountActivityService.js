const redis = require("../../../utils/redis/redisClient");

const ACTIVE_WINDOW_MS = 10 * 1000;

async function getActiveCountByRole(role) {
  try {
    const keys = await redis.keys("activity:*");
    const now = Date.now();
    let count = 0;
    for (const key of keys) {
      const raw = await redis.get(key);
      if (!raw) continue;
      const data = JSON.parse(raw);
      if (Number(data.role) !== Number(role)) continue;
      if (now - data.lastSeen <= ACTIVE_WINDOW_MS) {
        count++;
      }
    }
    return count;
  } catch (err) {
    console.error("[REDIS] Active count failed", err);
    return null;
  }
}

module.exports = { getActiveCountByRole };
