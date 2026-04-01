const redis = require('redis');
const logger = require('../logger');

class RedisClient {
  constructor() {
    if (!RedisClient.instance) {
      this.client = redis.createClient({
        url: process.env.REDIS_URL || 'redis://127.0.0.1:6379'
      });
      this._connect();
      RedisClient.instance = this;
    }
    return RedisClient.instance;
  }

  async _connect() {
    try {
      await this.client.connect();
      logger.info('Redis connected');

      this.client.on('error', (err) => {
        logger.error('Redis client error:', err);
      });
      this.client.on('reconnecting', () => {
        logger.warn('Redis client reconnecting...');
      });

      await this.flushDb();

    } catch (err) {
      logger.error('Redis connection error:', err);
      process.exit(1);
    }
  }

  async flushDb() {
    try {
      await this.client.flushDb();
      logger.warn('[Cache] Redis DB cleared on server restart');
    } catch (err) {
      logger.error('Error flushing Redis DB:', err);
    }
  }

  async get(key) {
    return this.client.get(key);
  }

  async setEx(key, ttl, value) {
    return this.client.setEx(key, ttl, value);
  }

  async set(key, value) {
    return this.client.set(key, value);
  }

  async del(key) {
    return this.client.del(key);
  }

  async incr(key) {
    return this.client.incr(key);
  }

  async expire(key, ttl) {
    return this.client.expire(key, ttl);
  }

  async ping() {
    return this.client.ping();
  }

  async keys(pattern) {
    return this.client.keys(pattern);
  }

  async flushAll() {
    try {
      await this.client.flushAll();
      logger.warn('[Cache] Entire Redis cache cleared on server restart');
    } catch (err) {
      logger.error('Error flushing Redis cache:', err);
    }
  }
  async ttl(key) {
  return this.client.ttl(key);
}
}

module.exports = new RedisClient();