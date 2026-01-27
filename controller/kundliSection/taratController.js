const asyncHandler = require("../../middlewares/asyncHandler");
const { BadRequestError } = require("../../errors");
const tarotService = require("../../services/kundli/taratService");

const createTarotSession = asyncHandler(async (req, res) => {
  const userId = req.user?._id || null;

  const data = await tarotService.generateTarotSession(userId);

  res.status(200).json({
    success: true,
    data, // { cards: [...] }
  });
});

const revealTarotCard = asyncHandler(async (req, res) => {
  const { cardName, direction, lang } = req.query;

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

module.exports = {
  createTarotSession,
  revealTarotCard,
};
