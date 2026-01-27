const axios = require("axios");
const ThirdPartyIntegration = require("../../models/ThirdPartyIntegration");
const Enums = require("../../utils/constants");
const RedisClient = require("../../utils/redis/redisClient");
const logger = require("../../utils/logger");
const REDIS_KEY = "active_sms_integration";
const CACHE_TTL = 36000;

const getSMSIntegration = async () => {
  try {
    logger.info("[SMS] Checking Redis cache for active SMS integration...");
    const cached = await RedisClient.get(REDIS_KEY);
    if (cached) {
      logger.info("[SMS] Found cached SMS integration config.");
      return JSON.parse(cached);
    }
    logger.info(
      "[SMS] No cache found. Querying DB for active SMS integration...",
    );
    const integration = await ThirdPartyIntegration.findOne({
      type: Enums.INTEGRATION.TYPE.SMS,
      is_active: true,
    }).lean();
    if (integration) {
      logger.info(`[SMS] Active integration found: ${integration.name}`);
      await RedisClient.setEx(
        REDIS_KEY,
        CACHE_TTL,
        JSON.stringify(integration),
      );
      logger.info("[SMS] Integration cached successfully.");
    } else {
      logger.warn("[SMS] No active SMS integration found in DB.");
    }
    return integration;
  } catch (err) {
    logger.error(`[SMS] Error fetching SMS integration: ${err.message}`);
    return null;
  }
};


const sendOTP = async (mobile, otp) => {
  try {
    logger.info(`[SMS] Preparing OTP for ${mobile}`);
    const integration = await getSMSIntegration();
    if (!integration) throw new Error("SMS integration not configured");
    const { base_url, api_key, extra_config } = integration;
    const {
      route = "dlt",
      sender_id = "LOYAST",
      message = "201329",
      flash = "0",
    } = extra_config;
    const cleanMobile = mobile.replace("+91", "").replace(/^91/, "");
    const params = {
      authorization: api_key,
      route,
      sender_id,
      message,
      variables_values: `${otp}|`,
      numbers: cleanMobile,
      flash,
    };
    logger.info(`[SMS] Sending GET request to: ${base_url}`);
    logger.info(`[SMS] Query Params: ${JSON.stringify(params)}`);
    const response = await axios.get(base_url, {
      params,
      timeout: 8000,
    });
    logger.info(`[SMS] Response Status: ${response.status}`);
    logger.info(`[SMS] Response Body: ${JSON.stringify(response.data)}`);
    const data = response.data || {};
    if (response.status !== 200 || data.return === false) {
      throw new Error(data.message || `Fast2SMS error (${response.status})`);
    }
    logger.info(`[SMS]OTP sent successfully to ${mobile}`);
    return data;
  } catch (error) {
    logger.error(`[SMS] Error sending OTP: ${error.message}`);
    if (error.response) {
      logger.error(`[SMS] Response Data: ${JSON.stringify(error.response.data)}`);
      logger.error(`[SMS] Status Code: ${error.response.status}`);
    }
    throw new Error("Failed to send OTP");
  }
};
module.exports = {
  sendOTP,
  getSMSIntegration,
};