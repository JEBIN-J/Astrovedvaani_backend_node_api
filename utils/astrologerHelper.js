// utils/astroHelper.js
const redis = require('redis');
const logger = require('./logger');

const client = redis.createClient({
  url: process.env.REDIS_URL || 'redis://127.0.0.1:6379'
});

client.connect()
  .then(() => logger.info('✅ Redis connected'))
  .catch(err => {
    logger.error('❌ Redis connection error:', err);
    process.exit(1); // Stop app if Redis is critical
  });

// OTP Configuration
const EXPIRY = parseInt(process.env.OTP_EXPIRE || '300', 10);
const DIGITS = parseInt(process.env.OTP_DIGITS || '6', 10);

// Astrologer Cache Configuration
const CACHE_PREFIX = 'astro:list';
const CACHE_TTL = 60 * 5; // 5 minutes cache

// OTP Functions
exports.generateOTP = () => {
  const min = Math.pow(10, DIGITS - 1);
  const max = Math.pow(10, DIGITS) - 1;
  return Math.floor(Math.random() * (max - min + 1)) + min + '';
};

exports.storeOTP = async (userId, otp) => {
  logger.info(`📨 Storing OTP for user:${userId}`);
  await client.setEx(`otp:${userId}`, EXPIRY, otp);
};

exports.validateOTP = async (userId, inputOtp) => {
  const key = `otp:${userId}`;
  const storedOtp = await client.get(key);

  if (!storedOtp) {
    logger.warn(`🚫 OTP not found for user:${userId}`);
    return false;
  }

  await client.del(key);
  const match = storedOtp === inputOtp;

  logger.info(`🔍 OTP match result for user:${userId}: ${match}`);
  return match;
};

// Astrologer Cache Functions
exports.getCachedAstrologers = async (cacheKey) => {
  try {
    const cached = await client.get(cacheKey);
    return cached ? JSON.parse(cached) : null;
  } catch (err) {
    logger.error('Cache read error:', err);
    return null;
  }
};

exports.cacheAstrologers = async (cacheKey, data) => {
  try {
    await client.setEx(cacheKey, CACHE_TTL, JSON.stringify(data));
  } catch (err) {
    logger.error('Cache write error:', err);
  }
};

// Cache Key Generator
exports.generateAstrologerCacheKey = (filters, cursor, limit) => {
  return `${CACHE_PREFIX}:${JSON.stringify(filters)}:${cursor}:${limit}`;
};

// Health Check
exports.checkRedisHealth = async () => {
  try {
    await client.ping();
    return true;
  } catch (err) {
    logger.error('Redis health check failed:', err);
    return false;
  }
};