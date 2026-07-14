const redis = require("redis");
const logger = require("../logger");

class RedisClient {
  constructor() {
    if (!RedisClient.instance) {
      const REDIS_DB = process.env.REDIS_DB || 0;

      this.client = redis.createClient({
        socket: {
          host: process.env.REDIS_HOST || "127.0.0.1",
          port: process.env.REDIS_PORT || 6379,
          connectTimeout: 10000,
          reconnectStrategy: (retries) => {
            logger.warn(`Redis reconnect attempt #${retries}`);
            return Math.min(retries * 200, 2000);
          },
        },
        database: Number(REDIS_DB),
      });

      this.client.on("connect", () =>
        logger.info(`Redis socket connected (DB ${REDIS_DB})`),
      );

      this.client.on("ready", () =>
        logger.info(`Redis ready (DB ${REDIS_DB})`),
      );

      this.client.on("error", (err) =>
        logger.error("Redis client error:", err),
      );

      this.client.on("end", () => logger.warn("Redis connection closed"));

      RedisClient.instance = this;
    }

    return RedisClient.instance;
  }

  async connect() {
    if (!this.client.isOpen) {
      await this.client.connect();
      logger.info("Redis connected successfully");
    }
  }

  // ---------------- BASIC METHODS ----------------

  get(key) {
    return this.client.get(key);
  }

  set(key, value) {
    return this.client.set(key, value);
  }

  setEx(key, ttl, value) {
    return this.client.setEx(key, ttl, value);
  }

  del(key) {
    return this.client.del(key);
  }

  keys(pattern) {
    return this.client.keys(pattern);
  }

  ping() {
    return this.client.ping();
  }

  expire(key, ttl) {
    return this.client.expire(key, ttl);
  }

  async incr(key) {
    return this.client.incr(key);
  }

  // ---------------- SET METHODS ----------------

  sMembers(key) {
    return this.client.sMembers(key);
  }

  sAdd(key, members) {
    return this.client.sAdd(key, members);
  }

  sRem(key, members) {
    return this.client.sRem(key, members);
  }

  // ---------------- MULTI / PIPELINE ----------------

  multi() {
    return this.client.multi();
  }

  /**
   * Execute multiple GET commands
   * @param {string[]} keys
   * @returns {Promise<Array>}
   */
  async mGet(keys = []) {
    if (!keys.length) return [];
    return this.client.mGet(keys);
  }

  /**
   * Execute pipeline safely
   * @param {Function} callback
   * @returns {Promise<Array>}
   */
  async pipeline(callback) {
    const multi = this.client.multi();

    callback(multi);

    return await multi.exec();
  }

  // ---------------- FLUSH METHODS ----------------

  async flushDb() {
    await this.client.flushDb();
  }

  async flushAll() {
    await this.client.flushAll();
  }

  // ---------------- RAW CLIENT ----------------

  getClient() {
    return this.client;
  }
}

module.exports = new RedisClient();
