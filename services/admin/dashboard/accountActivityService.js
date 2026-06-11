const redis = require("../../../utils/redis/redisClient");

const ACTIVE_WINDOW_MS = 10 * 1000;

async function getActiveCountByRole(role) {
  try {
    const keys = await redis.keys("activity:*");
    console.log("Active keys:", keys);
    const now = Date.now();
    let count = 0;
    for (const key of keys) {
      const raw = await redis.get(key);
      if (!raw) continue;
      const data = JSON.parse(raw);
      console.log("Activity data:", data);
      if (Number(data.role) !== Number(role)) continue;
      console.log(`Checking activity for user ${data.userId} with role ${data.role}`);
      console.log(`Last seen: ${new Date(data.lastSeen).toISOString()}, now: ${new Date(now).toISOString()}`);
      if (data?.connectTime >= data?.disconnectTime) {
        console.log(`User ${data.userId} is active`);
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