const axios = require("axios");
const UserAstrology = require("../../models/UserAstrology");
const { NotFoundError, BadRequestError, ApiError } = require("../../errors");
const logger = require("../../utils/logger");
const CacheService = require("../../utils/redis/cacheService");
const API = require("./api").default;

const TTL_30_DAYS = 60 * 60 * 24 * 30;
const { getSaasHeaders } = require("../../utils/apiHeader");
const generateCacheKey = (id1, id2) => {
  const sortedIds = [id1.toString(), id2.toString()].sort();
  return `matchmaking:${sortedIds[0]}:${sortedIds[1]}`;
};

const formatDateDDMMYYYY = (date) => {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

const formatTimeHHMM = (timeStr) => {
  if (!timeStr) return "";
  const directMatch = timeStr.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (directMatch) return timeStr;
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match) {
    let [, hh, mm, meridian] = match;
    hh = parseInt(hh, 10);
    if (meridian.toUpperCase() === "PM" && hh < 12) hh += 12;
    if (meridian.toUpperCase() === "AM" && hh === 12) hh = 0;
    return `${String(hh).padStart(2, "0")}:${mm}`;
  }
  const d = new Date(`1970-01-01T${timeStr}`);
  if (!isNaN(d.getTime())) {
    return d.toISOString().substr(11, 5);
  }
  logger.warn(`Unrecognized time format: ${timeStr}`);
  return timeStr;
};

const validateUserData = (user, role) => {
  if (!user.birthDate)
    throw new BadRequestError(`${role} birthDate is missing`);
  if (!user.birthTime)
    throw new BadRequestError(`${role} birthTime is missing`);
  if (!user.birthPlace)
    throw new BadRequestError(`${role} birthPlace is missing`);
};

const getMatchMakingData = async (id1, id2) => {
  try {
    logger.info(`Fetching astrology data for users: ${id1}, ${id2}`);
    if (!id1 || !id2) {
      throw new BadRequestError("Both user IDs are required");
    }
    const user1 = await UserAstrology.findOne({
      userId: id1,
      relationshipToOwner: "self",
    });
    const user2 = await UserAstrology.findById(id2);
    if (!user1 || !user2) {
      throw new NotFoundError("User astrology data not found");
    }

    validateUserData(user1, "Your:");
    validateUserData(user2, "Partner:");
    const cacheKey = generateCacheKey(id1, id2);
    const cachedData = await CacheService.get(cacheKey);
    if (cachedData) {
      logger.info(`Cache hit for key: ${cacheKey}`);
      const { lastUpdated } = cachedData;
      if (
        new Date(user1.updatedAt).getTime() ===
          new Date(lastUpdated.user1).getTime() &&
        new Date(user2.updatedAt).getTime() ===
          new Date(lastUpdated.user2).getTime()
      ) {
        logger.info("Returning matchmaking data from cache");
        return cachedData.data;
      }
      logger.info("Cache is outdated, fetching fresh data");
    } else {
      logger.info(`Cache miss for key: ${cacheKey}`);
    }
    let boy, girl;
    if (user1.gender === 1 && user2.gender === 2) {
      boy = user1;
      girl = user2;
    } else if (user1.gender === 2 && user2.gender === 1) {
      boy = user2;
      girl = user1;
    } else {
      boy = user1;
      girl = user2;
    }
    logger.info(`boy name ---${boy.name} and girl name : ---${girl.name}`);
    const cleanDOB = (date) => formatDateDDMMYYYY(date).replace(/\//g, "-");

    const cleanLang = (lang) => (lang || "en").trim(); // remove space

    const params = {
      // ✅ Names
      boy_name: boy.name.trim(),
      girl_name: girl.name.trim(),

      // ✅ Date format
      boy_dob: cleanDOB(boy.birthDate),
      boy_tob: formatTimeHHMM(boy.birthTime),
      boy_tz: boy.timezone || 5.5,
      boy_birthPlace: boy.birthPlace.trim(),

      girl_dob: cleanDOB(girl.birthDate),
      girl_tob: formatTimeHHMM(girl.birthTime),
      girl_tz: girl.timezone || 5.5,
      girl_birthPlace: girl.birthPlace.trim(),

      // ✅ No space
      lang: cleanLang(boy.preferredLanguage),
    };

    logger.info(
      `Calling MatchMaking API with params: ${JSON.stringify(params)}`,
    );
    const response = await API.MATCH_MAKING(params);

    // logger.info(`MatchMaking API response received, status: ${response.status}`);
    if (response?.data?.data) {
      response.data.data.boy = {
        ...response.data.data.boy,
        name: boy.name,
      };
      response.data.data.girl = {
        ...response.data.data.girl,
        name: girl.name,
      };
    }
    await CacheService.set(
      cacheKey,
      {
        data: response.data,
        lastUpdated: {
          user1: user1.updatedAt,
          user2: user2.updatedAt,
        },
      },
      TTL_30_DAYS,
    );
    return response.data;
  } catch (error) {
    logger.error({
      message: "getMatchMakingData failed",
      error: error.response ? error.response.data : error.message,
      stack: error.stack,
    });
    if (error instanceof BadRequestError || error instanceof NotFoundError) {
      throw error;
    }
    throw new ApiError("Something went wrong while fetching matchmaking data");
  }
};

module.exports = {
  getMatchMakingData,
};
