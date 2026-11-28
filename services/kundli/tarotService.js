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

const tarotSessionKey = (userId) =>
  CacheService.generateKey(
    CacheService.CACHE_PREFIXES.USER_DETAILS,
    "tarot-session",
    userId || "guest",
  );

const generateTarotSession = async (userId = null, baseUrl) => {
  try {
    const cacheKey = tarotSessionKey(userId);

    const cached = await CacheService.get(cacheKey);
    if (cached) {
      logger.info("Returning Tarot Session from cache (same day)");
      return cached;
    }

    logger.info("[TAROT] Drawing Tarot Session (local astro engine)");

    // { cards: [...] } — three cards drawn by the local astro engine
    const response = await API.TAROT_SESSION(baseUrl);

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

// Reveals a card from the user's current session (drawn by the local astro
// engine, kept until midnight). The local engine has no lookup by card name,
// so only cards from that session can be revealed.
const revealTarotCard = async ({ cardName, userId = null, baseUrl }) => {
  try {
    if (!cardName) {
      throw new Error("Card name is required");
    }

    logger.info(`[TAROT] Revealing Card: ${cardName}`);

    // Look in the latest one/three-card draw first, then in the session.
    const lastDraw = (await CacheService.get(lastDrawKey(userId))) || [];
    let card = API.TAROT_REVEAL({ cardName, cards: lastDraw });
    if (!card) {
      const session = await generateTarotSession(userId, baseUrl);
      card = API.TAROT_REVEAL({ cardName, cards: session?.cards });
    }
    if (!card) {
      throw new Error(
        `Card "${cardName}" is not part of today's tarot reading`,
      );
    }

    logger.info("[TAROT] Reveal success");

    return { card };
  } catch (error) {
    logger.error(
      "[TAROT] Reveal API error:",
      error.response?.data || error.message,
    );

    throw new Error(
      error.response?.data?.message || error.message || "Failed to reveal tarot card",
    );
  }
};

// The user's latest one/three-card draw, kept until midnight so its cards can
// be revealed too (the astrologer app reveals cards from a three-card draw).
const lastDrawKey = (userId) =>
  CacheService.generateKey(
    CacheService.CACHE_PREFIXES.USER_DETAILS,
    "tarot-last-draw",
    userId || "guest",
  );

const rememberDraw = async (userId, cards) => {
  try {
    await CacheService.set(lastDrawKey(userId), cards, getSecondsUntilMidnight());
  } catch (err) {
    logger.error(`[TAROT] Could not cache last draw: ${err.message}`);
  }
};

const oneCard = async (baseUrl, userId = null) => {
  try {
    logger.info("[TAROT] Calling One Card Tarot API");

    const response = await API.TAROT_ONE_CARD(baseUrl);

    logger.info("[TAROT] One Card Tarot API success");

    const card = response.data?.data?.card;
    if (card) await rememberDraw(userId, [card]);

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
const threeCard = async (baseUrl, userId = null) => {
  try {
    logger.info("[TAROT] Calling Three Card Tarot API");

    const response = await API.TAROT_THREE_CARD(baseUrl);

    logger.info("[TAROT] Three Card Tarot API success");

    const spread = response.data?.data?.spread;
    if (spread?.length) await rememberDraw(userId, spread);

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
