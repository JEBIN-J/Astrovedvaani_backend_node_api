const axios = require("axios");
const logger = require("../../utils/logger");
const UserAstrology = require("../../models/UserAstrology");
const { updateUserAstrologyWithKundli } = require("./userAstrologyService");
const CacheService = require("../../utils/redis/cacheService");
const { query } = require("express");
const { BadRequestError } = require("../../errors");
const User = require("../../models/User");
const { getDosha, getTransitPlanets } = require("./transitDoshaService");
const API = require("./api").default;
const { fetchUserDetailsById } = require("../astrologer/userService");
const formatWithLeadingZero = (num) => String(num).padStart(2, "0");

const convertTo24Hour = (timeStr) => {
  if (!timeStr) return "00:00";
  const parts = timeStr.trim().split(" ");
  if (parts.length === 1) return parts[0];
  const [time, modifier] = parts;
  let [hours, minutes] = time.split(":").map(Number);
  if (modifier.toUpperCase() === "PM" && hours < 12) hours += 12;
  if (modifier.toUpperCase() === "AM" && hours === 12) hours = 0;
  return `${formatWithLeadingZero(hours)}:${formatWithLeadingZero(minutes)}`;
};
const getKundliData = async (userId, queryParams = {}, isRelative = false) => {
  logger.info(
    `getKundliData called for userId=${userId}, isRelative=${isRelative}`,
  );

  // Fetch the profile (self or relative)
  let profile;
  if (isRelative) {
    profile = await UserAstrology.findById(userId);
  } else {
    profile = await UserAstrology.findOne({
      userId,
      relationshipToOwner: "self",
    });
  }

  if (!profile) {
    logger.error("Astrology profile not found for user");
    throw new Error("Astrology profile not found for user");
  }

  const cacheKey = CacheService.generateKey(
    CacheService.CACHE_PREFIXES.USER_DETAILS,
    "kundli-basic",
    profile._id.toString(),
    JSON.stringify(queryParams),
  );

  const cachedData = await CacheService.get(cacheKey);
  if (cachedData) {
    logger.info(
      `Returning Kundli data from cache for profileId=${profile._id}`,
    );
    return cachedData;
  }

  if (
    !queryParams.day &&
    (!profile.birthDate || !profile.birthTime || !profile.birthPlace)
  ) {
    logger.error("Missing birth details in profile");
    throw new Error("Missing birth details in profile");
  }

  // Prepare API params
  const apiParams = {
    day:
      queryParams.day ||
      formatWithLeadingZero(new Date(profile.birthDate).getDate()),
    month:
      queryParams.month ||
      formatWithLeadingZero(new Date(profile.birthDate).getMonth() + 1),
    year: queryParams.year || new Date(profile.birthDate).getFullYear(),
    hour: queryParams.hour || convertTo24Hour(profile.birthTime).split(":")[0],
    min: queryParams.min || convertTo24Hour(profile.birthTime).split(":")[1],
    tz: queryParams.tz || profile?.timezone || 5.5,
    lang: queryParams.lang || profile?.preferredLanguage || "en",
    name: queryParams.name || profile?.name,
    birthPlace: queryParams.birthPlace || profile?.birthPlace?.trim(),
  };

  logger.info(`Kundli API params: ${JSON.stringify(apiParams)}`);

  const apiUrl = API.KUNDLI(apiParams);
  logger.info(`Fetching Kundli data from API: ${apiUrl}`);
  const response = await axios.get(apiUrl);
  logger.info(`Kundli data fetched successfully for profileId=${profile._id}`);

  // Mark profile as Kundli generated
  if (!profile.isKundli) {
    profile.isKundli = true;
    await profile.save();
    logger.info(
      `Marked profile as Kundli generated for profileId=${profile._id}`,
    );
  }

  // Update user's astrology data using profile._id
  if (response.data && response.data.success && !isRelative) {
    await updateUserAstrologyWithKundli(userId, response.data, false);
  } else {
    logger.warn(
      `Kundli API response unsuccessful for profileId=${profile._id}`,
    );
  }

  await CacheService.set(cacheKey, response.data, 48 * 60 * 60); // 48 hours TTL
  logger.info(
    `Cached Kundli data for profileId=${profile._id} with 48 hours TTL`,
  );

  return response.data;
};
const getKundliDetailsData = async (userId, isQuery, queryParams = {}) => {
  logger.info(`getKundliDetailsData called for userId=${userId}`);
  const cacheKey = CacheService.generateKey(
    CacheService.CACHE_PREFIXES.USER_DETAILS,
    "kundli-details",
    userId,
    JSON.stringify(queryParams),
  );
  const cachedData = await CacheService.get(cacheKey);
  if (cachedData) {
    logger.info(
      `Returning Kundli Details data from cache for userId=${userId}`,
    );
    return cachedData;
  }

  let profile;
  if (!queryParams.day) {
    if (!isQuery) {
      profile = await UserAstrology.findOne({
        userId,
        relationshipToOwner: "self",
      });
    } else {
      profile = await UserAstrology.findById(userId);
    }
    if (!profile) {
      logger.error("Astrology profile not found for user");
      throw new Error("Astrology profile not found for user");
    }
    if (!profile.birthDate || !profile.birthTime || !profile.birthPlace) {
      logger.error("Missing birth details in profile");
      throw new Error("Missing birth details in profile");
    }
  }

  // ---- NEW ADD-ON LOGIC ----
  const apiParams = {
    day:
      queryParams.day ||
      formatWithLeadingZero(new Date(profile.birthDate).getDate()),
    month:
      queryParams.month ||
      formatWithLeadingZero(new Date(profile.birthDate).getMonth() + 1),
    year: queryParams.year || new Date(profile.birthDate).getFullYear(),
    hour: queryParams.hour || convertTo24Hour(profile.birthTime).split(":")[0],
    min: queryParams.min || convertTo24Hour(profile.birthTime).split(":")[1],
    tz: queryParams.tz || profile?.timezone || 5.5,
    lang: queryParams.lang || profile?.preferredLanguage || "en",
    name: queryParams.name || profile?.name,
    birthPlace: queryParams.birthPlace || profile?.birthPlace?.trim(),
  };

  logger.info(`Kundli API params: ${JSON.stringify(apiParams)}`);

  const apiUrl = API.KUNDLI_DETAILS(apiParams);
  logger.info(`Fetching Kundli Details data from API: ${apiUrl}`);

  const response = await axios.get(apiUrl);
  logger.info(`Kundli Details data fetched successfully for userId=${userId}`);

  await CacheService.set(cacheKey, response.data, 48 * 60 * 60); // 48 hours TTL
  logger.info(
    `Cached Kundli Details data for userId=${userId} with 48 hours TTL`,
  );

  return response.data;
};

const getKPDetails = async (userId, queryParams = {}, isRelative = false) => {
  logger.info(
    `getKPDetails called for userId=${userId}, isRelative=${isRelative}`,
  );

  const cacheKey = CacheService.generateKey(
    CacheService.CACHE_PREFIXES.USER_DETAILS,
    "kundli-KP",
    userId,
    JSON.stringify(queryParams),
  );

  const cachedData = await CacheService.get(cacheKey);
  if (cachedData) {
    logger.info(`Returning KP data from cache for userId=${userId}`);
    return cachedData;
  }

  let profile;
  if (!queryParams.dob) {
    if (isRelative) {
      profile = await UserAstrology.findById(userId);
    } else {
      profile = await UserAstrology.findOne({
        userId,
        relationshipToOwner: "self",
      });
    }

    if (!profile) {
      logger.error("Astrology profile not found for user");
      throw new Error("Astrology profile not found for user");
    }

    if (!profile.birthDate || !profile.birthTime || !profile.birthPlace) {
      logger.error("Missing birth details in profile");
      throw new Error("Missing birth details in profile");
    }
  }

  const formatDate = (date) => {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  /**
   * Ensures time is always HH:mm (no seconds)
   * Handles: 12:41, 12:41:00, 12:41 PM
   */
  const formatTimeHHMM = (time) => {
    if (!time) return null;

    // If already HH:mm
    if (/^\d{2}:\d{2}$/.test(time)) {
      return time;
    }

    // If HH:mm:ss
    if (/^\d{2}:\d{2}:\d{2}$/.test(time)) {
      return time.slice(0, 5);
    }

    // If AM/PM format
    const date = new Date(`1970-01-01 ${time}`);
    if (!isNaN(date)) {
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      return `${hours}:${minutes}`;
    }

    throw new Error("Invalid time format");
  };

  const apiParams = {
    dob: queryParams.dob || formatDate(profile.birthDate),
    tob: queryParams.tob || formatTimeHHMM(convertTo24Hour(profile.birthTime)),
    tz:
      queryParams.tz ||
      profile?.timezone ||
      -new Date(profile.birthDate).getTimezoneOffset() / 60,
    birthPlace: queryParams.birthPlace || profile?.birthPlace?.trim(),
  };

  console.log("apiParams", apiParams);
  logger.info(`KP API params: ${JSON.stringify(apiParams)}`);

  const apiUrl = API.KP_DETAILS(apiParams);
  logger.info(`Fetching KP data from API: ${apiUrl}`);

  const response = await axios.get(apiUrl);
  logger.info(`KP data fetched successfully for userId=${userId}`);

  if (!queryParams.dob && !isRelative) {
    profile.isKundli = true;
    await profile.save();
    logger.info(`Marked profile as Kundli generated for userId=${userId}`);

    if (response.data && response.data.success) {
      await updateUserAstrologyWithKundli(userId, response.data);
    } else {
      logger.warn(`KP API response unsuccessful for userId=${userId}`);
    }
  }

  await CacheService.set(cacheKey, response.data, 48 * 60 * 60);
  logger.info(`Cached KP data for userId=${userId} with 48 hours TTL`);

  console.log("kp response.data", response.data);
  return response.data;
};

const getAshtakvargaCharts = async (
  userId,
  style = "north",
  dob,
  tob,
  tz,
  birthPlace,
  isQuery = false,
  isRelative = false,
) => {
  logger.info(
    `getAshtakvargaCharts called for userId=${userId}, style=${style}, isRelative=${isRelative}`,
  );

  const cacheKey = CacheService.generateKey(
    CacheService.CACHE_PREFIXES.USER_DETAILS,
    "kundli-Ashtakvarga",
    userId,
  );

  const cachedData = await CacheService.get(cacheKey);
  if (cachedData) {
    logger.info(`Returning Ashtakvarga data from cache for userId=${userId}`);
    return cachedData;
  }

  let profile;
  if (isRelative) {
    profile = await UserAstrology.findById(userId);
  } else {
    profile = await UserAstrology.findOne({
      userId,
      relationshipToOwner: "self",
    });
  }

  if (!profile) {
    logger.error("Astrology profile not found for user");
    throw new Error("Astrology profile not found for user");
  }

  if (!profile.birthDate || !profile.birthTime || !profile.birthPlace) {
    logger.error("Missing birth details in profile");
    throw new Error("Missing birth details in profile");
  }

  // Format date as dd/mm/yyyy
  const formatDate = (date) => {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  /**
   * Ensures time is always HH:mm (no seconds)
   */
  const formatTimeHHMM = (time) => {
    if (!time) return null;

    // Already HH:mm
    if (/^\d{2}:\d{2}$/.test(time)) {
      return time;
    }

    // HH:mm:ss → HH:mm
    if (/^\d{2}:\d{2}:\d{2}$/.test(time)) {
      return time.slice(0, 5);
    }

    // AM/PM format
    const date = new Date(`1970-01-01 ${time}`);
    if (!isNaN(date)) {
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      return `${hours}:${minutes}`;
    }

    throw new Error("Invalid time format");
  };

  dob = dob || formatDate(profile.birthDate);
  tob = tob || formatTimeHHMM(convertTo24Hour(profile.birthTime));
  tz =
    tz ||
    profile?.timezone ||
    -new Date(profile.birthDate).getTimezoneOffset() / 60;
  birthPlace = birthPlace || profile.birthPlace.trim();

  const apiUrl = API.ASHTAKVARGA_CHARTS({
    dob,
    tob,
    birthPlace,
    tz,
    style,
  });

  logger.info(`Fetching Ashtakvarga data from API: ${apiUrl}`);

  let response;
  try {
    response = await axios.get(apiUrl);
    logger.info(`Ashtakvarga data fetched successfully for userId=${userId}`);
  } catch (err) {
    logger.error(
      `Request failed with status code ${err.response?.status || err.message}`,
    );
    throw err;
  }

  // Mark self profile only as Kundli generated
  if (!profile.isKundli && !isRelative) {
    profile.isKundli = true;
    await profile.save();
    logger.info(`Marked profile as Kundli generated for userId=${userId}`);
  }

  // Update user's astrology data only for self profile
  if (response.data && response.data.success && !isRelative) {
    await updateUserAstrologyWithKundli(userId, response.data);
  } else {
    logger.warn(`Ashtakvarga API response unsuccessful for userId=${userId}`);
  }

  await CacheService.set(cacheKey, response.data, 48 * 60 * 60);
  logger.info(`Cached Ashtakvarga data for userId=${userId} with 48 hours TTL`);

  console.log("ashtak response.data", response.data);

  return response.data;
};

const getCharts = async (
  userId,
  div = "D1",
  style = "north",
  lang = "en",
  dob,
  tob,
  tz,
  birthPlace,
  isQuery = false,
  isRelative = false,
) => {
  logger.info(
    `getCharts called for userId=${userId}, div=${div}, style=${style}, lang=${lang}, isRelative=${isRelative}`,
  );

  const cacheKey = CacheService.generateKey(
    CacheService.CACHE_PREFIXES.USER_DETAILS,
    `kundli-charts-${div}-${style}-${lang}`,
    userId,
  );

  const cachedData = await CacheService.get(cacheKey);
  if (cachedData) {
    logger.info(`Returning chart data from cache for userId=${userId}`);
    return cachedData;
  }

  // Fetch profile: self or relative
  let profile;
  if (isRelative) {
    profile = await UserAstrology.findById(userId);
  } else {
    profile = await UserAstrology.findOne({
      userId,
      relationshipToOwner: "self",
    });
  }

  if (!profile) {
    logger.error("Astrology profile not found for user");
    throw new Error("Astrology profile not found for user");
  }

  if (!profile.birthDate || !profile.birthTime || !profile.birthPlace) {
    logger.error("Missing birth details in profile");
    throw new Error("Missing birth details in profile");
  }

  // Format date as dd/mm/yyyy
  const formatDate = (date) => {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  /**
   * Ensures time is always HH:mm (no seconds)
   */
  const formatTimeHHMM = (time) => {
    if (!time) return null;

    // HH:mm
    if (/^\d{2}:\d{2}$/.test(time)) {
      return time;
    }

    // HH:mm:ss → HH:mm
    if (/^\d{2}:\d{2}:\d{2}$/.test(time)) {
      return time.slice(0, 5);
    }

    // AM/PM format
    const date = new Date(`1970-01-01 ${time}`);
    if (!isNaN(date)) {
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      return `${hours}:${minutes}`;
    }

    throw new Error("Invalid time format");
  };

  dob = dob || formatDate(profile.birthDate);
  tob = tob || formatTimeHHMM(convertTo24Hour(profile.birthTime));
  tz =
    tz ||
    profile?.timezone ||
    -new Date(profile.birthDate).getTimezoneOffset() / 60;
  birthPlace = birthPlace || profile.birthPlace.trim();

  const apiUrl = API.CHARTS({
    dob,
    tob,
    tz,
    lang,
    birthPlace,
    div,
    style,
  });

  logger.info(`Fetching chart data from API: ${apiUrl}`);

  const response = await axios.get(apiUrl);
  logger.info(`Chart data fetched successfully for userId=${userId}`);

  // Mark profile as Kundli generated only for self profile
  if (!profile.isKundli && !isRelative) {
    profile.isKundli = true;
    await profile.save();
    logger.info(`Marked profile as Kundli generated for userId=${userId}`);
  }

  // Update user's astrology data only for self profile
  if (response.data && response.data.success && !isRelative) {
    await updateUserAstrologyWithKundli(userId, response.data);
  } else {
    logger.warn(`Chart API response unsuccessful for userId=${userId}`);
  }

  await CacheService.set(cacheKey, response.data, 48 * 60 * 60);
  logger.info(`Cached chart data for userId=${userId} with 48 hours TTL`);

  console.log("charts response.data", response.data);

  return response.data;
};
const getDasha = async (
  userId,
  useQueryParams,
  day,
  month,
  year,
  hour,
  min,
  tz,
  lang,
  name,
  location,
  isQuery = false,
) => {
  // ---------------- QUERY PARAM MODE (UNCHANGED) ----------------
  if (useQueryParams) {
    const apiUrl = API.DASHA({
      day,
      month,
      year,
      hour,
      min,
      tz: tz || 5.5,
      lang: lang || "en",
      name: name || "User",
      location,
    });

    logger.info(`Fetching Dasha data from API (query params): ${apiUrl}`);
    const response = await axios.get(apiUrl);
    return response.data;
  }

  // ---------------- PROFILE MODE (SELF / RELATIVE) ----------------
  let profile;

  if (!isQuery) {
    profile = await UserAstrology.findOne({
      userId,
      relationshipToOwner: "self",
    });
  } else {
    profile = await UserAstrology.findById(userId);
  }

  if (!profile) {
    logger.error("Astrology profile not found for user");
    throw new Error("Astrology profile not found for user");
  }

  const {
    name: profileName = "User",
    birthDate: birthDateStr,
    birthTime,
    birthPlace,
  } = profile;

  if (!birthDateStr || !birthTime || !birthPlace) {
    throw new Error("Missing birth details in profile");
  }

  const birthDate = new Date(birthDateStr);
  const hourMin = convertTo24Hour(birthTime);
  const [h, m] = hourMin.split(":");

  const getTimeZoneOffset = (date) => -new Date(date).getTimezoneOffset() / 60;

  const tzOffset = getTimeZoneOffset(birthDate);

  const apiUrl = API.DASHA({
    day: String(birthDate.getDate()).padStart(2, "0"),
    month: String(birthDate.getMonth() + 1).padStart(2, "0"),
    year: birthDate.getFullYear(),
    hour: h.padStart(2, "0"),
    min: m.padStart(2, "0"),
    tz: 5.5,
    lang: "en",
    name: profileName,
    location: birthPlace.trim(),
  });

  logger.info(`Fetching Dasha data from API (profile): ${apiUrl}`);
  const response = await axios.get(apiUrl);

  // 🔥 ONLY REQUIRED SAFETY
  if (response.data?.success && !isQuery) {
    await updateUserAstrologyWithKundli(userId, response.data);
  }

  const cacheKey = CacheService.generateKey(
    CacheService.CACHE_PREFIXES.USER_DETAILS,
    `dasha-${profileName}`,
    userId,
  );

  await CacheService.set(cacheKey, response.data, 48 * 60 * 60);
  return response.data;
};

const getAscendantReport = async (
  userId,
  lang = "en",
  dob,
  tob,
  tz,
  birthPlace,
  isQuery,
) => {
  logger.info(
    `getAscendantReport called for userId=${userId}, lang=${lang}, isQuery=${isQuery}`,
  );

  const cacheKey = CacheService.generateKey(
    CacheService.CACHE_PREFIXES.USER_DETAILS,
    `ascendant-report-${lang}`,
    userId,
  );

  const cachedData = await CacheService.get(cacheKey);
  if (cachedData) {
    logger.info(`Returning Ascendant Report from cache for userId=${userId}`);
    return cachedData;
  }

  // 🔥 Resolve profile: self OR relative
  let profile;
  if (!isQuery) {
    profile = await UserAstrology.findOne({
      userId,
      relationshipToOwner: "self",
    });
  } else {
    profile = await UserAstrology.findById(userId);
  }

  if (!profile) {
    throw new Error("Astrology profile not found for user");
  }

  // ---------------- Helpers ----------------
  const formatDate = (date) => {
    const d = new Date(date);
    return `${String(d.getDate()).padStart(2, "0")}/${String(
      d.getMonth() + 1,
    ).padStart(2, "0")}/${d.getFullYear()}`;
  };

  const cleanTOB = (tob) => {
    if (!tob) return null;

    if (/^\d{1,2}:\d{1,2}:\d{1,2}$/.test(tob)) {
      return tob.split(":").slice(0, 2).join(":");
    }

    if (/^\d{1,2}:\d{1,2}$/.test(tob)) {
      return tob;
    }

    return null;
  };

  // ---------------- Resolve DOB / TOB ----------------
  let hourMin = profile.birthTime ? convertTo24Hour(profile.birthTime) : null;

  const cleanedTOB = cleanTOB(tob || hourMin);
  if (!cleanedTOB) {
    throw new Error("Invalid time of birth format. Use HH:mm (Example: 17:56)");
  }

  const getTimeZoneOffset = (date) => -new Date(date).getTimezoneOffset() / 60;

  dob = dob || (profile.birthDate ? formatDate(profile.birthDate) : null);
  tob = cleanedTOB;
  tz = tz || (profile.birthDate ? getTimeZoneOffset(profile.birthDate) : null);
  birthPlace =
    birthPlace || (profile.birthPlace ? profile.birthPlace.trim() : null);

  if (!dob || !tob || tz === null || tz === undefined || !birthPlace) {
    throw new Error("Missing birth details (dob/tob/tz/birthPlace)");
  }

  // ---------------- API CALL ----------------
  const apiUrl = API.ASCENDANT_REPORT({
    dob,
    tob,
    birthPlace,
    tz,
    lang,
  });

  logger.info(`[Ascendant API] ${apiUrl}`);
  const response = await axios.get(apiUrl);

  // 🔥 Update ONLY for self (NOT relative)
  if (response.data?.success && !isQuery) {
    await updateUserAstrologyWithKundli(userId, response.data);
  }

  // ---------------- Cache ----------------
  await CacheService.set(cacheKey, response.data, 48 * 60 * 60);
  logger.info(`Cached Ascendant Report for userId=${userId}`);

  return response.data;
};

const getMonthlyChoghadiya = async (userId, location, month, isQuery) => {
  logger.info(
    `getMonthlyChoghadiya called for userId=${userId}, location=${location}, month=${month}`,
  );
  if (!location || !month) throw new Error("Location and month are required");
  const cacheKey = CacheService.generateKey(
    CacheService.CACHE_PREFIXES.USER_DETAILS,
    `monthly-choghadiya-${location}-${month}`,
    userId,
  );
  const cachedData = await CacheService.get(cacheKey);
  if (cachedData) {
    logger.info(`Returning Monthly Choghadiya from cache for userId=${userId}`);
    return cachedData;
  }
  const apiUrl = API.MONTHLY_CHOGHADIYA({ location, month });
  logger.info(`Fetching Monthly Choghadiya from API: ${apiUrl}`);
  const response = await axios.get(apiUrl);
  await CacheService.set(cacheKey, response.data, 24 * 60 * 60);
  logger.info(`Cached Monthly Choghadiya for userId=${userId}`);
  return response.data;
};

const getFullNumerology = async (userId, isQuery, queryParams = {}) => {
  logger.info(`getFullNumerology called for userId=${userId}`);
  let { name, dob, tob, tz, birthplace } = queryParams;

  // ✅ Check if user provided any details
  const userProvided = name || dob || tob || tz || birthplace;

  if (!userProvided) {
    // 👉 Use profile details if nothing is provided
    let profile;
    if (!isQuery) {
      profile = await UserAstrology.findOne({
        userId,
        relationshipToOwner: "self",
      });
    } else {
      profile = await UserAstrology.findById(userId);
    }

    if (!profile) throw new Error("Astrology profile not found for user");
    if (!profile.birthDate || !profile.birthTime || !profile.birthPlace) {
      throw new Error("Missing birth details in profile");
    }

    const formatDate = (date) => {
      const d = new Date(date);
      return `${String(d.getDate()).padStart(2, "0")}/${String(
        d.getMonth() + 1,
      ).padStart(2, "0")}/${d.getFullYear()}`;
    };

    dob = formatDate(profile.birthDate);
    tob = convertTo24Hour(profile.birthTime);
    tz = -new Date(profile.birthDate).getTimezoneOffset() / 60;
    birthplace = profile.birthPlace.trim();
    name = profile.name;
  } else {
    // 👉 Clean user-provided values
    if (dob) {
      const d = new Date(dob);
      dob = `${String(d.getDate()).padStart(2, "0")}/${String(
        d.getMonth() + 1,
      ).padStart(2, "0")}/${d.getFullYear()}`;
    }
    if (tob) {
      tob = convertTo24Hour(tob);
    }
    if (!tz) {
      tz = 5.5; // default India timezone
    }
  }

  // ✅ Cache key based on user + params
  const cacheKey = CacheService.generateKey(
    CacheService.CACHE_PREFIXES.USER_DETAILS,
    `full-numerology-${userId}-${dob}-${tob}-${tz}-${birthplace}-${name}`,
  );

  const cachedData = await CacheService.get(cacheKey);
  if (cachedData) {
    logger.info(`Returning Full Numerology from cache: ${cacheKey}`);
    return cachedData;
  }

  const apiUrl = API.FULL_NUMEROLOGY({ name, dob, tob, tz, birthplace });
  logger.info(`Fetching Full Numerology from API: ${apiUrl}`);

  const response = await axios.get(apiUrl);

  await CacheService.set(cacheKey, response.data, 48 * 60 * 60);
  logger.info(`Cached Full Numerology: ${cacheKey}`);

  return response.data;
};

const getChoghadiya = async (userId, location, date, isQuery) => {
  logger.info(
    `getChoghadiya called for userId=${userId}, location=${location}, date=${date}`,
  );
  if (!location || !date) throw new Error("Location and date are required");
  const cacheKey = CacheService.generateKey(
    CacheService.CACHE_PREFIXES.USER_DETAILS,
    `choghadiya-${location}-${date}`,
    userId,
  );
  const cachedData = await CacheService.get(cacheKey);
  if (cachedData) {
    logger.info(`Returning Choghadiya from cache for userId=${userId}`);
    return cachedData;
  }
  const apiUrl = API.CHOGHADIYA({ location, date });
  logger.info(`Fetching Choghadiya from API: ${apiUrl}`);
  const response = await axios.get(apiUrl);
  await CacheService.set(cacheKey, response.data, 24 * 60 * 60);
  logger.info(`Cached Choghadiya for userId=${userId}`);
  return response.data;
};
const getFullKundliData = async (userId, options = {}, isQuery = false) => {
  logger.info(
    `getFullKundliData called for userId=${userId}, isQuery=${isQuery}`,
  );

  let profile;
  if (!isQuery) {
    profile = await UserAstrology.findOne({
      userId,
      relationshipToOwner: "self",
    });
    if (!profile) throw new Error("Astrology profile not found for user");
  } else {
    profile = await UserAstrology.findById(userId);
  }

  const dateObj =
    options.year && options.month && options.day
      ? new Date(`${options.year}-${options.month}-${options.day}`)
      : profile
        ? new Date(profile.birthDate)
        : null;

  const hourVal =
    options.hour ||
    (profile ? convertTo24Hour(profile.birthTime).split(":")[0] : "0");
  const minVal =
    options.min ||
    (profile ? convertTo24Hour(profile.birthTime).split(":")[1] : "0");

  // Build FullKundli API params
  const apiParams = {
    day:
      options.day || (dateObj ? formatWithLeadingZero(dateObj.getDate()) : ""),
    month:
      options.month ||
      (dateObj ? formatWithLeadingZero(dateObj.getMonth() + 1) : ""),
    year: options.year || (dateObj ? dateObj.getFullYear() : ""),
    hour: hourVal,
    min: minVal,
    tz: options.tz || (profile ? profile.timezone : 5.5),
    lang: options.lang || (profile ? profile.preferredLanguage : "en"),
    name: options.name || (profile ? profile.name : ""),
    birthPlace:
      options.birthPlace || (profile ? profile.birthPlace.trim() : ""),
    div: options.div || "D1",
    style: options.style || "south",
  };

  // Log exactly what we are sending to FullKundli API
  logger.info(
    `Sending FullKundli API request with params: ${JSON.stringify(apiParams)}`,
  );

  const cacheKey = CacheService.generateKey(
    CacheService.CACHE_PREFIXES.USER_DETAILS,
    `full-kundli-${userId}-${apiParams.div}-${apiParams.style}-${apiParams.name}`,
    userId,
  );

  const cachedData = await CacheService.get(cacheKey);
  if (cachedData) {
    logger.info(`Cache hit for userId=${userId}`);
    return cachedData;
  }

  let fullKundliData;
  try {
    const apiUrl = API.FULL_KUNDLI(apiParams);
    logger.info(`FullKundli API URL: ${apiUrl}`);
    const response = await axios.get(apiUrl);
    fullKundliData = response.data;
  } catch (err) {
    logger.error(`Failed to fetch FullKundli API for userId=${userId}`, err);
    throw err;
  }

  // Dosha API params
  const doshaParams = {
    dob: isQuery
      ? `${apiParams.day}/${apiParams.month}/${apiParams.year}`
      : new Date(profile.birthDate).toLocaleDateString("en-GB"),
    tob: isQuery ? `${apiParams.hour}:${apiParams.min}` : profile.birthTime,
    birthPlace: isQuery ? apiParams.birthPlace : profile.birthPlace,
    tz: isQuery ? apiParams.tz : profile.timezone,
    lang: isQuery ? apiParams.lang : profile.preferredLanguage || "en",
  };
  logger.info(
    `Sending Dosha API request with params: ${JSON.stringify(doshaParams)}`,
  );

  const dosha = await getDosha(userId, null, doshaParams);

  // Transit Planets API params
  const transitParams = {
    ...doshaParams,
    transit_date: options.transit_date || doshaParams.dob,
    transit_time: options.transit_time || "00:00",
    transitPlace: options.transitPlace || doshaParams.birthPlace,
    transit_tz: options.transit_tz || doshaParams.tz,
    house_type: "placidus",
    zodiac_type: "sidereal",
    direction: "p1_to_p2",
  };
  logger.info(
    `Sending TransitPlanets API request with params: ${JSON.stringify(transitParams)}`,
  );

  const transitPlanets = await getTransitPlanets(userId, null, transitParams);

  fullKundliData = {
    ...fullKundliData,
    data: {
      ...fullKundliData.data,
      dosha,
      transitPlanets,
    },
  };

  if (!isQuery && profile && !profile.isKundli) {
    profile.isKundli = true;
    await profile.save();
  }

  await CacheService.set(cacheKey, fullKundliData, 48 * 60 * 60);
  logger.info(`Cached Full Kundli + Dosha + Transit for userId=${userId}`);

  return fullKundliData;
};

const getLocationByCoordinates = async (lat, lon) => {
  const apiKey = process.env.GOOGLE_API_KEY;
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${apiKey}`;

  const response = await axios.get(url);

  if (!response.data.results.length) {
    throw new Error("No address found for the given coordinates");
  }
  //const formattedAddress = response.data.results[0].formatted_address;

  const components = response.data.results[0].address_components;
  const city =
    components.find((c) => c.types.includes("locality"))?.long_name || null;
  const state =
    components.find((c) => c.types.includes("administrative_area_level_1"))
      ?.long_name || null;
  const country =
    components.find((c) => c.types.includes("country"))?.long_name || null;

  return {
    //address: formattedAddress,
    city,
    state,
    country,
  };
};

const downloadFreeReportPdf = async (
  userId,
  queryParams = {},
  isRelative = false,
) => {
  logger.info(
    `downloadFreeReportPdf called → userId=${userId}, isRelative=${isRelative}`,
  );
  //logger.info(PDF URL: ${apiUrl});
  let profile = null;

  if (isRelative) {
    profile = await UserAstrology.findById(userId);
  } else {
    profile = await UserAstrology.findOne({
      userId,
      relationshipToOwner: "self",
    });
  }

  if (!profile) throw new Error("Birth profile not found");

  // Resolve name
  let finalName = "User";
  if (!isRelative) {
    const user = await User.findById(userId);
    finalName =
      user?.name ||
      user?.fullName ||
      user?.username ||
      user?.email?.split("@")[0] ||
      "User";
  } else {
    finalName = "Relative";
  }

  const dob = new Date(profile.birthDate);
  const [h, m] = convertTo24Hour(profile.birthTime).split(":");

  const apiUrl = API.FREE_REPORT_PDF({
    day: String(dob.getDate()).padStart(2, "0"),
    month: String(dob.getMonth() + 1).padStart(2, "0"),
    year: dob.getFullYear(),
    hour: h.padStart(2, "0"),
    min: m.padStart(2, "0"),
    tzone: 5.5,
    birthPlace: profile.birthPlace.trim(),
    name: finalName,
  });

  logger.info(`Fetching PDF from: ${apiUrl}`);

  const response = await axios.get(apiUrl, {
    responseType: "arraybuffer", // VERY IMPORTANT
    timeout: 90000,
  });

  return response.data; // PDF buffer
};

const getCompleteKundliByUserId = async (userId) => {
  logger.info(
    `[getCompleteKundliByUserId] Service STARTED for userId=${userId}`,
  );

  const user = await fetchUserDetailsById(userId);
  if (!user) {
    throw new BadRequestError(`User not found with ID: ${userId}`);
  }
  if (!user.birthDate || !user.birthTime || !user.birthPlace) {
    throw new BadRequestError(
      "Birth date, birth time, and birth place are required to generate Kundli",
    );
  }

  // Normalize date
  const birthDate = new Date(user.birthDate);

  const options = {
    day: String(birthDate.getDate()).padStart(2, "0"),
    month: String(birthDate.getMonth() + 1).padStart(2, "0"),
    year: birthDate.getFullYear(),
    hour: convertTo24Hour(user.birthTime).split(":")[0],
    min: convertTo24Hour(user.birthTime).split(":")[1],
    tz: user.timezone || 5.5,
    lang: "en",
    name: user.name || "",
    birthPlace: user.birthPlace.trim(),
    div: "D1",
    style: "south",
  };

  logger.info(
    `[getCompleteKundliByUserId] Normalized options: ${JSON.stringify(options)}`,
  );

  const fullKundliData = await getFullKundliData(userId, options, true);
  const d1Chart = fullKundliData?.data?.charts?.D1 || null;
  const redisKey = `kundli:user:${userId}:D1`;
  const alreadyExists = await CacheService.get(redisKey);

  if (!alreadyExists && d1Chart) {
    await CacheService.set(redisKey, d1Chart, 60 * 60);
    logger.info(`[KUNDLI] D1 chart cached for user ${userId}`);
  }
  logger.info(
    `[getCompleteKundliByUserId] Service COMPLETED for userId=${userId}`,
  );
  return fullKundliData;
};

module.exports = {
  getKundliData,
  getKundliDetailsData,
  getKPDetails,
  getAshtakvargaCharts,
  getCharts,
  getDasha,
  getAscendantReport,
  getMonthlyChoghadiya,
  getFullNumerology,
  getChoghadiya,
  getFullKundliData,
  getLocationByCoordinates,
  downloadFreeReportPdf,
  getCompleteKundliByUserId,
};
