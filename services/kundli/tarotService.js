const API = require("./api").default;
const TAROT_CARDS = require("../../utils/tarotCards");
const CacheService = require("../../utils/redis/cacheService");
const logger = require("../../utils/logger");
const axios = require("axios");
const { getSaasHeaders } = require("../../utils/apiHeader");

const getSecondsUntilMidnight = () => {
  const now = new Date();

  const midnight = new Date();
  midnight.setHours(24, 0, 0, 0); // next 12:00 AM
  return Math.floor((midnight - now) / 1000);
};

const generateTarotSession = async (userId = null) => {
  try {
    const cacheKey = CacheService.generateKey(
      CacheService.CACHE_PREFIXES.USER_DETAILS,
      "tarot-session",
      userId || "guest",
    );

    const cached = await CacheService.get(cacheKey);
    if (cached) {
      logger.info("Returning Tarot Session from cache (same day)");
      return cached;
    }

    const url = API.TAROT_SESSION();

    logger.info("[TAROT] Fetching Tarot Session from API");
    logger.info(`[TAROT] URL: ${url}`);

    const response = await axios.get(url, {
      headers: getSaasHeaders(),
      timeout: 15000,
    });

    const data = response.data;

    const ttl = getSecondsUntilMidnight();

    await CacheService.set(cacheKey, data, ttl);

    logger.info(`Cached Tarot Session till midnight (TTL: ${ttl}s)`);

    return data;
  } catch (error) {
    logger.error(
      "[TAROT] Session API error:",
      error.response?.data || error.message,
    );

    throw new Error(
      error.response?.data?.message || "Failed to generate tarot session",
    );
  }
};

const revealTarotCard = async ({
  cardName,
  direction = "upright",
  lang = "en",
}) => {
  try {
    if (!cardName) {
      throw new Error("Card name is required");
    }

    const url = API.TAROT_REVEAL({
      cardName,
      direction,
      lang,
    });

    logger.info(`[TAROT] Revealing Card: ${cardName}`);
    logger.info(`[TAROT] URL: ${url}`);

    const response = await axios.get(url, {
      headers: getSaasHeaders(),
      timeout: 15000,
    });

    logger.info("[TAROT] Reveal API success");

    return response.data;
  } catch (error) {
    logger.error(
      "[TAROT] Reveal API error:",
      error.response?.data || error.message,
    );

    throw new Error(
      error.response?.data?.message || "Failed to reveal tarot card",
    );
  }
};

const oneCard = async () => {
  try {
    const url = API.TAROT_ONE_CARD();
    logger.info("[TAROT] Calling One Card Tarot API");
    logger.info(`[TAROT] URL: ${url}`);

    const response = await axios.post(
      url,
      {},
      {
        headers: getSaasHeaders(),
        timeout: 15000,
      },
    );

    logger.info("[TAROT] One Card Tarot API success");

    return response.data;
  } catch (error) {
    logger.error(
      "[TAROT] One Card Tarot API error:",
      error.response?.data || error.message,
    );

    throw new Error(
      error.response?.data?.message || "Failed to fetch one card tarot",
    );
  }
};

// 🔮 THREE CARD TAROT (EXTERNAL API)
const threeCard = async () => {
  try {
    const url = API.TAROT_THREE_CARD(); // no params

    logger.info("[TAROT] Calling Three Card Tarot API");
    logger.info(`[TAROT] URL: ${url}`);

    const response = await axios.post(
      url,
      {},
      {
        headers: getSaasHeaders(),
        timeout: 15000,
      },
    );

    logger.info("[TAROT] Three Card Tarot API success");

    return response.data;
  } catch (error) {
    logger.error(
      "[TAROT] Three Card Tarot API error:",
      error.response?.data || error.message,
    );

    throw new Error(
      error.response?.data?.message || "Failed to fetch three card tarot",
    );
  }
};

module.exports = {
  generateTarotSession,
  revealTarotCard,
  oneCard,
  threeCard,
};
