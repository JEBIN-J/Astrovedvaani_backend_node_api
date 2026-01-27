const { NotFoundError } = require("../../errors");
const Setting = require("../../models/Setting");
const logger = require("../../utils/logger");
const redisClient = require("../../utils/redis/redisClient");
const REDIS_KEY = "validation_setting";

exports.getValidationSetting = async () => {
  try {
    const cachedSetting = await redisClient.get(REDIS_KEY);
    if (cachedSetting) {
      logger.info("Validation setting fetched from Redis");
      return JSON.parse(cachedSetting);
    }
    const setting = await Setting.findOne();
    if (!setting) {
      throw new NotFoundError("Validation setting not found");
    }
    await redisClient.set(REDIS_KEY, JSON.stringify(setting));
    logger.info("Validation setting cached in Redis (permanent until update)");
    return setting;
  } catch (err) {
    logger.error("Error fetching validation setting:", err);
    throw err;
  }
};

exports.updateValidationSetting = async (data) => {
  try {
    let setting = await Setting.findOne();
    if (!setting) {
      setting = new Setting(data);
    } else {
      Object.assign(setting, data);
    }
    await setting.save();
    await redisClient.del(REDIS_KEY);
    logger.info("Validation setting cache cleared after update");
    await redisClient.set(REDIS_KEY, JSON.stringify(setting));
    logger.info("Validation setting updated in Redis (permanent)");
    return setting;
  } catch (err) {
    logger.error("Error updating validation setting:", err);
    throw err;
  }
};

exports.isValidationAllowed = async (key) => {
  try {
    let setting = await exports.getValidationSetting();
    if (typeof setting.toObject === 'function') {
      setting = setting.toObject();
    }
    if (!Object.prototype.hasOwnProperty.call(setting, key)) {
      logger.warn(`Validation check failed: "${key}" does not exist in settings`);
      return false;
    }
    return Boolean(setting[key]);
  } catch (err) {
    logger.error(`Error checking validation for "${key}":`, err);
    return false;
  }
};