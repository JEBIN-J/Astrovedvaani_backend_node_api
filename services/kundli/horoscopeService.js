const axios = require("axios");
const logger = require("../../utils/logger");
const UserAstrology = require("../../models/UserAstrology");
const CacheService = require("../../utils/redis/cacheService");
const { NotFoundError, BadRequestError, ApiError } = require("../../errors");
const API = require("./api").default;
const kundliService = require("./kundliService");
const kundliImage = require("../../models/kundliImage");
const HOROSCOPE_CACHE_TTL = 24 * 60 * 60;

const formatDateForApi = (dateStr) => {
  if (!dateStr) return "";
  const parts = dateStr.split("/");
  if (parts.length === 3) return dateStr;
  const dateObj = new Date(dateStr);
  const day = String(dateObj.getDate()).padStart(2, "0");
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const year = dateObj.getFullYear();
  return `${day}/${month}/${year}`;
};

const getHoroscopeData = async ({
  userId,
  type,
  date,
  lang = "en",
  week = "this",
  zodiac,
  isQuery,
}) => {
  try {
    logger.info(
      `[Horoscope] getHoroscopeData called: userId=${userId}, type=${type}, date=${date}, week=${week}, lang=${lang}`,
    );

    // ----------------- USER ASTROLOGY PROFILE -----------------
    let profile;
    if (!isQuery) {
      profile = await UserAstrology.findOne({
        userId,
        relationshipToOwner: "self",
      });
    } else {
      profile = await UserAstrology.findById(userId);
    }

    //  If zodiac is provided → skip profile requirement
    if (!profile && !zodiac) {
      logger.error(`[Horoscope] No profile and no zodiac for userId=${userId}`);
      throw new Error("User astrology profile or zodiac is required.");
    }

    //  If profile exists but rasi missing AND no zodiac → error
    if (profile && !profile.rasi && !zodiac) {
      throw new Error("Zodiac sign missing (rasi).");
    }
    const zodiacSign = zodiac
      ? zodiac.toLowerCase()
      : profile.rasi.toLowerCase();

    const formattedDate = date ? formatDateForApi(date) : null;

    // ----------------- SELECT API BASED ON TYPE -----------------
    let apiUrl = "";
    switch (type) {
      case "daily":
        apiUrl = API.DAILY_HOROSCOPE({
          zodiac: zodiacSign,
          date: formattedDate,
          lang,
          type: "normal",
        });
        break;
      case "weekly":
        apiUrl = API.WEEKLY_HOROSCOPE({ zodiac: zodiacSign, week, lang });
        break;
      case "monthly":
        apiUrl = API.MONTHLY_HOROSCOPE({ zodiac: zodiacSign, lang });
        break;
      case "yearly":
        apiUrl = API.YEARLY_HOROSCOPE({
          zodiac: zodiacSign,
          year: new Date().getFullYear(),
          lang,
        });
        break;
      default:
        logger.error(`[Horoscope] Unsupported type: ${type}`);
        throw new Error(`Unsupported horoscope type: ${type}`);
    }

    logger.info(`[Horoscope] Prepared API URL: ${apiUrl}`);

    // ----------------- HIT EXTERNAL API -----------------
    let response;
    try {
      response = await axios.get(apiUrl);
    } catch (err) {
      logger.error(
        `[Horoscope] API request failed: ${err.message}`,
        err.response?.data || {},
      );
      throw new Error(`Failed to fetch horoscope data: ${err.message}`);
    }

    // ----------------- FETCH KUNDLI IMAGE DIRECTLY NO CACHE -----------------
    const kundliImages = await kundliImage.find().lean();
    const matchedKundli = kundliImages.find(
      (k) => k.name.toLowerCase() === zodiacSign,
    );
    const zodiacImage = matchedKundli ? matchedKundli.image : null;

    // ----------------- FINAL RESPONSE -----------------
    const finalData = {
      success: response.data.success,
      type: response.data.type,
      zodiac: response.data.zodiac,
      zodiacImage,
      data: response.data.data,
    };

    return finalData;
  } catch (err) {
    logger.error(`[Horoscope] Error for userId=${userId}: ${err.message}`);
    throw err;
  }
};

const zodiacMap = {
  aries: 1,
  taurus: 2,
  gemini: 3,
  cancer: 4,
  leo: 5,
  virgo: 6,
  libra: 7,
  scorpio: 8,
  sagittarius: 9,
  capricorn: 10,
  aquarius: 11,
  pisces: 12,
};

const getBigHoroscope = async ({
  userId,
  type = "big",
  date,
  lang = "en",
  isQuery,
}) => {
  try {
    logger.info(
      `[Horoscope] getBigHoroscope called: userId=${userId}, type=${type}, date=${date}, lang=${lang}`,
    );

    const requestedDate = new Date(date.split("/").reverse().join("-"));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let profile;
    if (!isQuery) {
      profile = await UserAstrology.findOne({
        userId,
        relationshipToOwner: "self",
      });
    } else {
      profile = await UserAstrology.findById(userId);
    }

    // Get rasi from profile or fall back to Kundli
    let rasi = profile?.rasi;
    if (!rasi) {
      logger.info(
        `[Horoscope] rasi missing for userId=${userId}, fetching from Kundli`,
      );
      const kundliData = await kundliService.getKundliData(userId);
      rasi = kundliData?.data?.basicDetails?.rasi;
    }

    if (!rasi) {
      logger.error(
        `[Horoscope] rasi still missing after Kundli fetch for userId=${userId}`,
      );
      throw new NotFoundError(
        "User astrology profile not found or missing zodiac sign (rasi).",
      );
    }

    const zodiacNumber = zodiacMap[rasi.toLowerCase()];
    if (!zodiacNumber) {
      logger.error(`[Horoscope] Invalid rasi for userId=${userId}: ${rasi}`);
      throw new BadRequestError(`Invalid zodiac sign (rasi): ${rasi}`);
    }

    const formattedDate = formatDateForApi(date);
    const cacheKey = CacheService.generateKey(
      "user:Bigdetails",
      "horoscope",
      type,
      formattedDate,
      userId,
    );
    const cachedData = await CacheService.get(cacheKey);

    if (cachedData) {
      logger.info(
        `[Horoscope] Returning cached data for userId=${userId}, type=${type}`,
      );
      return cachedData;
    }

    const apiUrl = API.BIG_DAILY_HOROSCOPE({
      zodiac: zodiacNumber,
      date: formattedDate,
      lang,
      type,
    });
    logger.info(`[Horoscope] Prepared API URL: ${apiUrl}`);

    let response;
    try {
      response = await axios.get(apiUrl);
    } catch (err) {
      logger.error(
        `[Horoscope] API request failed: ${err.message}`,
        err.response?.data || {},
      );
      throw new ApiError(
        `Failed to fetch big daily horoscope: ${err.message}`,
        err.response?.status || 500,
      );
    }

    await CacheService.set(cacheKey, response.data, HOROSCOPE_CACHE_TTL);
    logger.info(
      `[Horoscope] Cached Big Daily Horoscope for userId=${userId}, type=${type}`,
    );

    return response.data;
  } catch (err) {
    logger.error(`[Horoscope] Error for userId=${userId}: ${err.message}`);
    if (
      err instanceof ApiError ||
      err instanceof BadRequestError ||
      err instanceof NotFoundError
    ) {
      throw err;
    }
    throw new ApiError(err.message, 500);
  }
};

const getGoodBadDays = async (userId, isQuery) => {
  try {
    let profile;
    if (!isQuery) {
      profile = await UserAstrology.findOne({
        userId,
        relationshipToOwner: "self",
      });
    } else {
      profile = await UserAstrology.findById(userId);
    }
    if (!profile || !profile.rasi) {
      logger.error(
        `[GoodBadDays] Profile missing or rasi not found for userId=${userId}`,
      );
      throw new Error(
        "User astrology profile not found or missing zodiac sign (rasi).",
      );
    }
    const zodiac = profile.rasi.toLowerCase();

    const cacheKey = CacheService.generateKey(
      "user:details",
      "good-bad-days",
      zodiac,
      userId,
    );
    const cachedData = await CacheService.get(cacheKey);
    if (cachedData) {
      logger.info(`[GoodBadDays] Returning cached data for userId=${userId}`);
      return cachedData;
    }

    const apiUrl = API.GOOD_BAD_DAYS("4");
    logger.info(`[GoodBadDays] Prepared API URL: ${apiUrl}`);

    let response;
    try {
      response = await axios.get(apiUrl);
    } catch (err) {
      logger.error(
        `[GoodBadDays] API request failed: ${err.message}`,
        err.response?.data || {},
      );
      throw new Error(`Failed to fetch Good/Bad Days data: ${err.message}`);
    }

    await CacheService.set(cacheKey, response.data, HOROSCOPE_CACHE_TTL);
    logger.info(`[GoodBadDays] Cached data for userId=${userId}`);

    return response.data;
  } catch (err) {
    logger.error(`[GoodBadDays] Error for userId=${userId}: ${err.message}`);
    throw err;
  }
};

module.exports = {
  getHoroscopeData,
  getBigHoroscope,
  getGoodBadDays,
};
