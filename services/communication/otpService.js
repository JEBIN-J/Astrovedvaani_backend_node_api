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
    const integration = await getSMSIntegration();
    if (!integration) {
      throw new Error("SMS integration not configured");
    }

    const { api_key, base_url, extra_config } = integration;
    const { template_id } = extra_config;

    if (!template_id) {
      throw new Error("MSG91 FLOW template_id missing");
    }

    const cleanMobile = mobile
      .toString()
      .replace(/\s+/g, "")
      .replace("+91", "")
      .replace(/^91/, "");

    const formattedMobile = `91${cleanMobile}`;

    const payload = {
      template_id: template_id,
      short_url: "0",
      realTimeResponse: "1",
      recipients: [
        {
          mobiles: formattedMobile,
          var: String(otp), // OTP goes into VAR1
        },
      ],
    };

    console.log("========== MSG91 FLOW REQUEST ==========");
    console.log("URL:", base_url);
    console.log("Headers: authkey =", "***");
    console.log("Body:", JSON.stringify(payload, null, 2));
    console.log("=======================================");

    const response = await axios.post(base_url, payload, {
      headers: {
        "Content-Type": "application/json",
        authkey: api_key,
        accept: "application/json",
      },
      timeout: 8000,
      validateStatus: () => true,
    });

    console.log("========== MSG91 FLOW RESPONSE ==========");
    console.log("HTTP Status:", response.status);
    console.log("Body:", response.data);
    console.log("========================================");

    if (response.status !== 200) {
      throw new Error(`FLOW HTTP error: ${response.status}`);
    }

    return {
      success: true,
      provider: "MSG91_FLOW",
      response: response.data,
    };
  } catch (error) {
    console.error("========== FLOW OTP ERROR ==========");
    console.error(error);
    console.error("===================================");

    return {
      success: false,
      provider: "MSG91_FLOW",
      message: error.message || "Failed to send OTP via FLOW",
    };
  }
};
module.exports = {
  sendOTP,
  getSMSIntegration,
};
