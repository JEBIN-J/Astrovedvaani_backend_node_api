const asyncHandler = require("../../middlewares/asyncHandler");
const { BadRequestError } = require("../../errors");
const tarotService = require("../../services/kundli/tarotService");
const logger = require("../../utils/logger");

// Backend origin as the browser sees it, used to build tarot image links.
// Behind a tunnel or proxy (e.g. VS Code port forwarding / dev tunnels) the
// Host header is rewritten to localhost:<port>; the public address the browser
// used is in X-Forwarded-Host, with its scheme in X-Forwarded-Proto.
const requestBaseUrl = (req) => {
  const forwardedHost = (req.get("x-forwarded-host") || "").split(",")[0].trim();
  if (forwardedHost) {
    const proto = (req.get("x-forwarded-proto") || "https").split(",")[0].trim();
    return `${proto}://${forwardedHost}`;
  }
  const originScheme = /^(https?):/i.exec(req.get("origin") || "")?.[1];
  return `${originScheme || req.protocol}://${req.get("host")}`;
};

const createTarotSession = asyncHandler(async (req, res) => {
  const userId = req.user?._id || null;

  const data = await tarotService.generateTarotSession(userId, requestBaseUrl(req));

  res.status(200).json({
    success: true,
    data, // { cards: [...] }
  });
});

// POST (body) or GET (query: the astrologer app sends ?cardName=...)
const revealTarotCard = asyncHandler(async (req, res) => {
  const { cardName } = { ...req.query, ...(req.body || {}) };
  if (!cardName) {
    throw new BadRequestError("cardName is required");
  }

  const data = await tarotService.revealTarotCard({
    cardName,
    userId: req.user?._id || null,
    baseUrl: requestBaseUrl(req),
  });

  res.status(200).json({
    success: true,
    data,
  });
});

// 🃏 One Card
const oneCardTarot = async (req, res) => {
  try {
    const data = await tarotService.oneCard(requestBaseUrl(req), req.user?._id || null);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    logger.error("One Card Tarot Error:", err.message);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// 🔮 Three Card
const threeCardTarot = async (req, res) => {
  try {
    logger.info("[API] Three Card Tarot request");

    const data = await tarotService.threeCard(requestBaseUrl(req), req.user?._id || null);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    logger.error("Three Card Tarot Error:", err.message);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

module.exports = {
  createTarotSession,
  revealTarotCard,
  oneCardTarot,
  threeCardTarot,
};
