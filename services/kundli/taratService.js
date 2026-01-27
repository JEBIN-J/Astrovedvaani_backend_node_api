const API = require("./api").default;
const TAROT_CARDS = require("../../utils/taratCards");
const CacheService = require("../../utils/redis/cacheService");
const logger = require("../../utils/logger");
const axios = require("axios");
const apiKey = process.env.VEDIC_API_KEY;

const pickRandomCards = (cards, count = 3) => {
  const shuffled = [...cards].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
};

const generateTarotSession = async (userId = null) => {
  const cacheKey = CacheService.generateKey(
    CacheService.CACHE_PREFIXES.USER_DETAILS,
    "tarot-session",
    userId || "guest",
  );

  const cached = await CacheService.get(cacheKey);
  if (cached) {
    logger.info("Returning Tarot Session from cache");
    return cached;
  }

  const cards = pickRandomCards(TAROT_CARDS, 3);

  const data = { cards };

  await CacheService.set(cacheKey, data, 10 * 60); // cache 10 min
  logger.info("Cached Tarot Session");

  return data;
};

const revealTarotCard = async ({
  cardName,
  direction = "upright",
  lang = "en",
}) => {
  if (!cardName) {
    throw new Error("Card name is required");
  }

  const params = {
    api_key: apiKey,
    card_name: cardName,
    direction,
    lang,
  };

  logger.info(`Fetching Tarot Yes/No for card=${cardName}`);

  const response = await getTarotYesNo(params);

  return response?.response || response;
};

const getTarotYesNo = async (params) => {
  try {
    const url = "https://api.vedicastroapi.com/v3-json/tarot/yes-no";
    const response = await axios.get(url, { params });
    return response.data;
  } catch (error) {
    console.error(
      "Error in getTarotYesNo:",
      error.response?.data || error.message,
    );
    throw new Error(
      error.response?.data?.message || "Failed to fetch tarot reading",
    );
  }
};

module.exports = {
  generateTarotSession,
  revealTarotCard,
};
