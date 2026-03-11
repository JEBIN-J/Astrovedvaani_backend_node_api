const { BadRequestError } = require("../../errors");
const asyncHandler = require("../../middlewares/asyncHandler");
const horoscopeService = require("../../services/kundli/horoscopeService");

const getHoroscope = asyncHandler(async (req, res) => {
  const { type, date, lang = "en", id, zodiac } = req.query;
  if (!type) {
    throw new BadRequestError(
      "Horoscope type is required (daily, weekly, monthly, yearly)",
    );
  }
  const tokenUserId = req.user?._id || null;
  const userId = id || tokenUserId;
  const isQuery = Boolean(id);
  if (!userId && !zodiac) {
    return res.status(400).json({
      success: false,
      message: "Either zodiac or user profile (token/id) is required.",
    });
  }

  const horoscopeData = await horoscopeService.getHoroscopeData({
    userId,
    type,
    date,
    lang,
    zodiac,
    isQuery,
  });

  res.status(200).json(horoscopeData);
});

const getBigHoroscope = asyncHandler(async (req, res) => {
  const { type, date, lang } = req.query;
  if (!type) {
    throw new BadRequestError(
      "Horoscope type is required (daily, weekly, monthly, yearly)",
    );
  }
  const id = req.query.id;
  const userId = id || req.user?._id;
  const isQuery = Boolean(id);
  const horoscopeData = await horoscopeService.getBigHoroscope({
    userId,
    type,
    date,
    lang,
    isQuery,
  });
  res.status(200).json(horoscopeData);
});

const getGoodBadDays = asyncHandler(async (req, res) => {
  const id = req.query.id;
  const userId = id || req.user?._id;
  const isQuery = Boolean(id);
  const goodBadDays = await horoscopeService.getGoodBadDays(userId, isQuery);
  res.status(200).json(goodBadDays);
});

module.exports = {
  getHoroscope,
  getBigHoroscope,
  getGoodBadDays,
};
