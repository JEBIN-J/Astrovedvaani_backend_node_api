const nodemailer = require("nodemailer");
const ThirdPartyIntegration = require("../../models/ThirdPartyIntegration");
const Enums = require("../../utils/constants");
const RedisClient = require("../../utils/redis/redisClient");

const REDIS_KEY = "active_email_integration";
const CACHE_TTL = 36000;

const getEmailIntegration = async () => {
  try {
    const cached = await RedisClient.get(REDIS_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
    const integration = await ThirdPartyIntegration.findOne({
      type: Enums.INTEGRATION.TYPE.EMAIL,
      is_active: true,
    }).lean();

    if (integration) {
      await RedisClient.setEx(REDIS_KEY, CACHE_TTL, JSON.stringify(integration));
    }
    return integration;
  } catch (err) {
    console.error("Error fetching email integration:", err);
    return null;
  }
};

const clearEmailIntegrationCache = async () => {
  await RedisClient.del(REDIS_KEY);
};

const createTransporter = (integration) => {
  const { base_url, api_key, extra_config } = integration;
  return nodemailer.createTransport({
    host: base_url,
    port: extra_config?.smtp_port || 587,
    secure: extra_config?.secure || false,
    auth: {
      user: extra_config?.from_email,
      pass: api_key,
    },
  });
};

module.exports = {
  getEmailIntegration,
  clearEmailIntegrationCache,
  createTransporter,
};
