const redis = require("redis");
const logger = require("../logger");

class RedisClient {
  constructor() {
    if (!RedisClient.instance) {
      this.client = redis.createClient({
        socket: {
          host: "127.0.0.1",
          port: 6379,
          connectTimeout: 10000,
          reconnectStrategy: (retries) => {
            logger.warn(`Redis reconnect attempt #${retries}`);
            return Math.min(retries * 200, 2000);
          },
        },
      });

      this.client.on("connect", () => logger.info("Redis socket connected"));
      this.client.on("ready", () => logger.info("Redis ready"));
      this.client.on("error", (err) => logger.error("Redis client error:", err));
      this.client.on("end", () => logger.warn("Redis connection closed"));

      RedisClient.instance = this;
    }
    return RedisClient.instance;
  }

  async connect() {
    try {
      if (!this.client.isOpen) {
        await this.client.connect();
        logger.info("Redis connected successfully");
      }
    } catch (err) {
      logger.error("Redis connection failed:", err);
    }
  }

  get(key) { return this.client.get(key); }
  set(key, value) { return this.client.set(key, value); }
  setEx(key, ttl, value) { return this.client.setEx(key, ttl, value); }
  del(key) { return this.client.del(key); }
  keys(pattern) { return this.client.keys(pattern); }
  ping() { return this.client.ping(); }

  async flushDb() { await this.client.flushDb(); }
  async flushAll() { await this.client.flushAll(); }

  getClient() { return this.client; }
}

module.exports = new RedisClient();
