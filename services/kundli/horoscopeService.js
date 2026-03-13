const axios = require("axios");
const logger = require("../../utils/logger");
const UserAstrology = require("../../models/UserAstrology");
const CacheService = require("../../utils/redis/cacheService");
const { NotFoundError, BadRequestError, ApiError } = require("../../errors");
const API = require("./api").default;
const kundliService = require("./kundliService");
const kundliImage = require("../../models/kundliImage");
const HOROSCOPE_CACHE_TTL = 24 * 60 * 60;
const { getSaasHeaders } = require("../../utils/apiHeader");
const formatDateForApi = (dateStr) => {
  if (!dateStr) return "";

  // ✅ If already a Date object
  if (dateStr instanceof Date) {
    const day = String(dateStr.getDate()).padStart(2, "0");
    const month = String(dateStr.getMonth() + 1).padStart(2, "0");
    const year = dateStr.getFullYear();
    return `${day}/${month}/${year}`;
  }

  // ✅ If string like "DD/MM/YYYY"
  if (typeof dateStr === "string") {
    const parts = dateStr.split("/");
    if (parts.length === 3) return dateStr;

    // Try parsing string date
    const dateObj = new Date(dateStr);
    if (!isNaN(dateObj)) {
      const day = String(dateObj.getDate()).padStart(2, "0");
      const month = String(dateObj.getMonth() + 1).padStart(2, "0");
      const year = dateObj.getFullYear();
      return `${day}/${month}/${year}`;
    }
  }

  throw new Error("Invalid date format");
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

    let profile;
    if (!isQuery) {
      profile = await UserAstrology.findOne({
        userId,
        relationshipToOwner: "self",
      });
    } else {
      profile = await UserAstrology.findById(userId);
    }

    if (!profile && !zodiac) {
      throw new Error("User astrology profile or zodiac is required.");
    }

    if (profile && !profile.rasi && !zodiac) {
      throw new Error("Zodiac sign missing (rasi).");
    }

    const zodiacSign = zodiac
      ? zodiac.toLowerCase()
      : profile.rasi.toLowerCase();

    const formattedDate = date
      ? formatDateForApi(date)
      : formatDateForApi(new Date());

    let apiUrl;
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
        throw new Error(`Unsupported horoscope type: ${type}`);
    }

    logger.info(`[Horoscope] Prepared API URL: ${apiUrl}`);
    let response;
    try {
      response = await axios.get(apiUrl, {
        headers: getSaasHeaders(),
        timeout: 15000,
      });
    } catch (err) {
      logger.error(
        `[Horoscope] API request failed`,
        err.response?.data || err.message,
      );
      throw new Error("Failed to fetch horoscope data");
    }

    // ----------------- FETCH ZODIAC IMAGE -----------------
    const kundliImages = await kundliImage.find().lean();
    const matchedKundli = kundliImages.find(
      (k) => k.name.toLowerCase() === zodiacSign,
    );

    // ----------------- FINAL RESPONSE -----------------
    return {
      success: response.data?.success ?? true,
      type,
      zodiac: zodiacSign,
      zodiacImage: matchedKundli ? matchedKundli.image : null,
      data: response.data?.data || response.data,
    };
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

const getGoodBadDays = async (userId, isQuery, location, month) => {
  try {
    let profile;
    if (!location) {
      if (!isQuery) {
        profile = await UserAstrology.findOne({
          userId,
          relationshipToOwner: "self",
        });
      } else {
        profile = await UserAstrology.findById(userId);
      }

      if (!profile || !profile.birthPlace) {
        logger.error(
          `[GoodBadDays] Profile missing or birthPlace not found for userId=${userId}`,
        );
        throw new Error(
          "User astrology profile not found or missing birthPlace.",
        );
      }

      location = profile.birthPlace;
    }

    // month fallback
    if (!month) {
      month = new Date().toLocaleString("en-US", { month: "long" });
    }

    const cacheKey = CacheService.generateKey(
      "user:details",
      "good-bad-days",
      location,
      month,
      userId,
    );

    const cachedData = await CacheService.get(cacheKey);

    if (cachedData) {
      logger.info(`[GoodBadDays] Returning cached data for userId=${userId}`);
      return cachedData;
    }

    const apiUrl = API.GOOD_BAD_DAYS(location, month);
    logger.info(`[GoodBadDays] Prepared API URL: ${apiUrl}`);

    const response = await axios.get(apiUrl, {
      headers: getSaasHeaders(),
      timeout: 15000,
    });

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
