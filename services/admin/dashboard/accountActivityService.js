const redis = require("../../../utils/redis/redisClient");

const ACTIVE_WINDOW_MS = 10 * 1000;

async function getActiveCountByRole(role) {
  try {
    const keys = await redis.keys("activity:*");
    const now = Date.now();
    let count = 0;
    for (const key of keys) {
      console.log(`Checking key ${key} for role ${role}`);
      const raw = await redis.get(key);
      if (!raw) continue;
      const data = JSON.parse(raw);
      if (Number(data.role) !== Number(role)) continue;
      const userId = data.userId || key.split(":")[1];
      console.log(`Checking activity for user ${userId} with role ${data.role}`);
      console.log(`Last seen: ${new Date(data.lastSeen).toISOString()}, now: ${new Date(now).toISOString()}`);
      console.log("data:", data);
      if(data?.connectTime > 0)
      {
        console.log(`User ${userId} connectTime: ${new Date(data.connectTime).toISOString()}`);
        if (data?.connectTime >= data?.disconnectTime) {
          console.log(`User ${userId} is active`);
          count++;
        }
      }
    }
    return count;
  } catch (err) {
    console.error("[REDIS] Active count failed", err);
    return null;
  }
}

module.exports = { getActiveCountByRole };