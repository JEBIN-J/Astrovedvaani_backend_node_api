const asyncHandler = require("../../middlewares/asyncHandler");
const { BadRequestError } = require("../../errors");
const tarotService = require("../../services/kundli/tarotService");
const logger = require("../../utils/logger");

const createTarotSession = asyncHandler(async (req, res) => {
  const userId = req.user?._id || null;

  const data = await tarotService.generateTarotSession(userId);

  res.status(200).json({
    success: true,
    data, // { cards: [...] }
  });
});

const revealTarotCard = asyncHandler(async (req, res) => {
  const { cardName, direction, lang } = req.body;
  if (!cardName) {
    throw new BadRequestError("cardName is required");
  }

  const data = await tarotService.revealTarotCard({
    cardName,
    direction,
    lang,
  });

  res.status(200).json({
    success: true,
    data,
  });
});

// 🃏 One Card
const oneCardTarot = async (req, res) => {
  try {
    const data = await tarotService.oneCard();

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

    const data = await tarotService.threeCard();

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
