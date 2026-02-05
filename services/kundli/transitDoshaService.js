const axios = require("axios");
const logger = require("../../utils/logger");
const UserAstrology = require("../../models/UserAstrology");
const { updateUserAstrologyWithKundli } = require("./userAstrologyService");
const CacheService = require("../../utils/redis/cacheService");
const { query } = require("express");
const { BadRequestError } = require("../../errors");
const User = require("../../models/User");
const API = require("./api").default;
const { getSaasHeaders } = require("../../utils/apiHeader");
const getDosha = async (userId, id, query = {}, isQuery = false) => {
  logger.info(
    `getDosha called for userId=${userId}, id=${id}, query=${JSON.stringify(
      query,
    )}, isQuery=${isQuery}`,
  );
  let { dob, tob, birthPlace, tz, lang } = query;
  lang = lang || "en";

  if (!isQuery) {
    let userAstro;
    if (id) {
      userAstro = await UserAstrology.findById(id).lean();
    } else if (userId) {
      userAstro = await UserAstrology.findOne({
        userId: userId,
        relationshipToOwner: "self",
      }).lean();
    } else {
      throw new Error("Either query params, id or logged-in user required");
    }
    if (!userAstro) throw new Error("User astrology profile not found");
    if (!userAstro.birthDate || !userAstro.birthTime || !userAstro.birthPlace) {
      throw new Error("User astrology profile is missing birth details");
    }
    dob = new Date(userAstro.birthDate).toLocaleDateString("en-GB");
    tob = userAstro.birthTime;
    birthPlace = userAstro.birthPlace;
    tz = userAstro.timezone != null ? userAstro.timezone : 5.5;
    lang = userAstro.preferredLanguage || "en";
  }

  if (!dob || !tob || !birthPlace || tz == null) {
    throw new Error("Missing required parameters for Dosha API");
  }

  // Convert time to 24-hour format
  tob = convertTo24HourFormat(tob);

  const cacheSuffix = id
    ? `dosha-astro-${id}`
    : userId
      ? `dosha-user-${userId}`
      : `dosha-${dob}-${tob}-${birthPlace}-${tz}`;
  const cacheKey = CacheService.generateKey(
    CacheService.CACHE_PREFIXES.USER_DETAILS,
    cacheSuffix,
    userId || id,
  );
  const cachedData = await CacheService.get(cacheKey);
  if (cachedData) {
    logger.info(`Returning Dosha from cache for key=${cacheKey}`);
    return cachedData;
  }

  const apiUrl = API.DOSHA({ dob, tob, birthPlace, tz, lang });
  logger.info(`Fetching Dosha from API: ${apiUrl}`);
  const response = await axios.get(apiUrl, {
    headers: getSaasHeaders(),
    timeout: 15000,
  });
  await CacheService.set(cacheKey, response.data, 24 * 60 * 60);
  logger.info(`Cached Dosha for key=${cacheKey}`);

  return response.data;
};

const getTransitPlanets = async (userId, id, query = {}, isQuery = false) => {
  logger.info(
    "getTransitPlanets called for userId=" +
      userId +
      ", id=" +
      id +
      ", query=" +
      JSON.stringify(query) +
      ", isQuery=" +
      isQuery,
  );
  let {
    dob,
    tob,
    tz,
    transit_date,
    transit_time,
    transit_tz,
    house_type = "placidus",
    zodiac_type = "sidereal",
    lang = "en",
    direction = "p1_to_p2",
    birthPlace,
    transitPlace,
  } = query;

  lang = lang || "en";
  if (!isQuery) {
    let userAstro;
    if (id) {
      userAstro = await UserAstrology.findById(id).lean();
    } else if (userId) {
      userAstro = await UserAstrology.findOne({
        userId: userId,
        relationshipToOwner: "self",
      }).lean();
    } else {
      throw new Error("Either query params, id, or logged-in user is required");
    }

    if (!userAstro) throw new Error("User astrology profile not found");
    if (!userAstro.birthDate || !userAstro.birthTime || !userAstro.birthPlace) {
      throw new Error("User astrology profile is missing birth details");
    }

    dob = new Date(userAstro.birthDate).toLocaleDateString("en-GB");
    tob = userAstro.birthTime;
    birthPlace = userAstro.birthPlace;
    tz = userAstro.timezone != null ? userAstro.timezone : 5.5;
    lang = userAstro.preferredLanguage || "en";

    transit_date = transit_date || dob;
    transit_time = transit_time || "00:00";
    transitPlace = transitPlace || birthPlace;
    transit_tz = transit_tz != null ? transit_tz : tz;
  } else {
    transit_date = transit_date || dob;
    transit_time = transit_time || "00:00";
    transitPlace = transitPlace || birthPlace;
    transit_tz = transit_tz != null ? transit_tz : tz;
  }

  logger.info(
    "Transit Planets parameters: dob=" +
      dob +
      ", tob=" +
      tob +
      ", birthPlace=" +
      birthPlace +
      ", tz=" +
      tz +
      ", transit_date=" +
      transit_date +
      ", transit_time=" +
      transit_time +
      ", transitPlace=" +
      transitPlace +
      ", transit_tz=" +
      transit_tz +
      ", house_type=" +
      house_type +
      ", zodiac_type=" +
      zodiac_type +
      ", lang=" +
      lang +
      ", direction=" +
      direction,
  );

  tob = convertTo24HourFormat(tob);
  transit_time = convertTo24HourFormat(transit_time);

  const cacheSuffix = id
    ? "transit-astro-" + id + "-" + transit_date + "-" + transit_time
    : userId
      ? "transit-user-" + userId + "-" + transit_date + "-" + transit_time
      : "transit-" +
        dob +
        "-" +
        tob +
        "-" +
        birthPlace +
        "-" +
        tz +
        "-" +
        transit_date +
        "-" +
        transit_time +
        "-" +
        transitPlace;
  const cacheKey = CacheService.generateKey(
    CacheService.CACHE_PREFIXES.USER_DETAILS,
    cacheSuffix,
    userId || id,
  );
  const cachedData = await CacheService.get(cacheKey);
  if (cachedData) {
    logger.info("Returning Transit Planets from cache for key=" + cacheKey);
    return cachedData;
  }
  const apiUrl = API.TRANSIT_PLANETS({
    dob,
    tob,
    tz,
    transit_date,
    transit_time,
    transit_tz,
    house_type,
    zodiac_type,
    lang,
    direction,
    birthPlace,
    transitPlace,
  });
  logger.info("Fetching Transit Planets from API: " + apiUrl);
  const response = await axios.get(apiUrl, {
    headers: getSaasHeaders(),
    timeout: 15000,
  });
  await CacheService.set(cacheKey, response.data, 24 * 60 * 60);
  logger.info("Cached Transit Planets for key=" + cacheKey);
  return response.data;
};
function convertTo24HourFormat(timeString) {
  if (!timeString) return timeString;
  if (/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(timeString.trim())) {
    return timeString.trim();
  }
  const time = timeString.trim().toUpperCase();
  const [timePart, modifier] = time.split(/\s+/);
  const [hours, minutes] = timePart.split(":");
  let hours24 = parseInt(hours, 10);
  if (modifier === "PM" && hours24 !== 12) {
    hours24 += 12;
  } else if (modifier === "AM" && hours24 === 12) {
    hours24 = 0;
  }

  return `${hours24.toString().padStart(2, "0")}:${minutes || "00"}`;
}

module.exports = {
  getDosha,
  getTransitPlanets,
};
