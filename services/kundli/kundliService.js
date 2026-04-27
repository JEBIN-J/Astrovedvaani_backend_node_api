const axios = require("axios");
const logger = require("../../utils/logger");
const UserAstrology = require("../../models/UserAstrology");
const { updateUserAstrologyWithKundli } = require("./userAstrologyService");
const CacheService = require("../../utils/redis/cacheService");
const { query } = require("express");
const { BadRequestError } = require("../../errors");
const User = require("../../models/User");
const { getDosha, getTransitPlanets } = require("./transitDoshaService");
// const { ResponseStream } = require("openai/lib/responses/ResponseStream.js");
const API = require("./api").default;
const { fetchUserDetailsById } = require("../astrologer/userService");
const { getSaasHeaders } = require("../../utils/apiHeader");
const { lang } = require("moment-timezone");
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

const convertToDobTob = ({
  dob,
  tob,
  day,
  month,
  year,
  hour,
  min,
  dateObj,
}) => {
  let finalDob = null;
  let finalTob = null;

  const pad = (v) => String(v).padStart(2, "0");

  const formatDate = (d) => {
    if (!(d instanceof Date) || isNaN(d)) return null;

    return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
  };

  const normalizeDOB = (dobStr) => {
    if (!dobStr) return null;

    dobStr = dobStr.replace(/\//g, "-");

    const parts = dobStr.split("-");

    // DD-MM-YYYY
    if (parts.length === 3 && parts[0].length <= 2) {
      return `${pad(parts[0])}-${pad(parts[1])}-${parts[2]}`;
    }

    // YYYY-MM-DD
    if (parts.length === 3 && parts[0].length === 4) {
      return `${pad(parts[2])}-${pad(parts[1])}-${parts[0]}`;
    }

    // Fallback
    const d = new Date(dobStr);

    if (!isNaN(d)) return formatDate(d);

    return null;
  };

  const cleanTime = (time) => {
    if (!time) return null;

    // HH:mm:ss → HH:mm
    if (/^\d{1,2}:\d{1,2}:\d{1,2}$/.test(time)) {
      return time.split(":").slice(0, 2).join(":");
    }

    // HH:mm
    if (/^\d{1,2}:\d{1,2}$/.test(time)) {
      return time;
    }

    return null;
  };

  // ============================
  // Case 1: dob + tob
  // ============================
  if (dob && tob) {
    finalDob = normalizeDOB(dob);
    finalTob = cleanTime(tob);
  }

  // ============================
  // Case 2: day month year hour min
  // ============================
  else if (day && month && year && hour && min) {
    finalDob = `${pad(day)}-${pad(month)}-${year}`;
    finalTob = `${pad(hour)}:${pad(min)}`;
  }

  // ============================
  // Case 3: Date Object
  // ============================
  else if (dateObj instanceof Date) {
    finalDob = formatDate(dateObj);
  }

  // ============================
  // Validation
  // ============================
  if (!finalDob) return null;

  return {
    dob: finalDob,
    tob: finalTob,
  };
};

const getKundliData = async (userId, queryParams = {}, isRelative = false) => {
  logger.info(
    `getKundliData called for userId=${userId}, isRelative=${isRelative}`,
  );

  // -------------------------------
  // Fetch profile
  // -------------------------------
  let profile = null;

  if (userId) {
    if (isRelative) {
      profile = await UserAstrology.findById(userId);
    } else {
      profile = await UserAstrology.findOne({
        userId,
        relationshipToOwner: "self",
      });
    }
  }

  // -------------------------------
  // Guest validation
  // -------------------------------
  if (!queryParams.day && !profile) {
    throw new Error("Please provide birth details in query params");
  }

  // -------------------------------
  // Validate profile
  // -------------------------------
  if (
    !queryParams.day &&
    profile &&
    (!profile.birthDate || !profile.birthTime || !profile.birthPlace)
  ) {
    throw new Error("Missing birth details in profile");
  }

  // -------------------------------
  // Prepare Date & Time
  // -------------------------------

  const day =
    queryParams.day ||
    formatWithLeadingZero(new Date(profile.birthDate).getDate());

  const month =
    queryParams.month ||
    formatWithLeadingZero(new Date(profile.birthDate).getMonth() + 1);

  const year = queryParams.year || new Date(profile.birthDate).getFullYear();

  const hour =
    queryParams.hour ||
    (profile ? convertTo24Hour(profile.birthTime).split(":")[0] : null);

  const min =
    queryParams.min ||
    (profile ? convertTo24Hour(profile.birthTime).split(":")[1] : null);

  const dob = `${day}-${month}-${year}`;
  const tob = `${hour}:${min}`;

  // -------------------------------
  // API Params
  // -------------------------------

  const apiParams = {
    dob,
    tob,

    tz: queryParams.tz || profile?.timezone || 5.5,

    lang: queryParams.lang || "en",

    name: queryParams.name || profile?.name || "User",

    birthPlace: queryParams.birthPlace || profile?.birthPlace?.trim(),
  };

  logger.info(`Kundli API paramsshdsgdhsgdhs: ${JSON.stringify(apiParams)}`);

  // -------------------------------
  // Cache Key
  // -------------------------------

  const cacheKey = CacheService.generateKey(
    CacheService.CACHE_PREFIXES.USER_DETAILS,
    `kundli-basic-${userId || "guest"}-${apiParams.lang}-${apiParams.name}-${dob}-${tob}-${apiParams.birthPlace}`,
    userId || "guest",
  );

  // -------------------------------
  // Check Cache
  // -------------------------------

  const cachedData = await CacheService.get(cacheKey);

  if (cachedData) {
    logger.info(`Kundli Cache hit for userId=${userId}`);
    return cachedData;
  }

  // -------------------------------
  // Call API
  // -------------------------------

  const apiUrl = API.KUNDLI(apiParams);

  logger.info(`Fetching Kundli data from API: ${apiUrl}`);

  const response = await axios.get(apiUrl, {
    headers: getSaasHeaders(),
    timeout: 15000,
  });

  logger.info(`Kundli data fetched successfully`);

  // -------------------------------
  // Update profile (SAFE)
  // -------------------------------

  if (profile && !profile.isKundli) {
    profile.isKundli = true;
    await profile.save();

    logger.info(`isKundli updated for userId=${userId}`);
  }

  // -------------------------------
  // Update astrology (Only logged user)
  // -------------------------------

  if (profile && response.data && response.data.success && !isRelative) {
    await updateUserAstrologyWithKundli(userId, response.data, false);
  }

  // -------------------------------
  // Save Cache
  // -------------------------------

  await CacheService.set(cacheKey, response.data, 48 * 60 * 60);

  logger.info(`Cached Basic Kundli for userId=${userId}`);

  return response.data;
};

const getKundliDetailsData = async (userId, isQuery, queryParams = {}) => {
  logger.info(`getKundliDetailsData called for userId=${userId}`);

  // ✅ Safe cache key (guest + user)
  const cacheKey = CacheService.generateKey(
    CacheService.CACHE_PREFIXES.USER_DETAILS,
    "kundli-details",
    userId || "guest",
    JSON.stringify(queryParams),
  );

  const cachedData = await CacheService.get(cacheKey);

  if (cachedData) {
    logger.info(
      `Returning Kundli Details data from cache for userId=${userId}`,
    );
    return cachedData;
  }

  let profile = null;

  if (!queryParams.day && userId) {
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

    if (!profile.birthDate || !profile.birthTime || !profile.birthPlace) {
      throw new Error("Missing birth details in profile");
    }
  }

  // ✅ Guest validation
  if (!userId && !queryParams.day) {
    throw new Error(
      "Please provide day, month, year, hour, min in query params",
    );
  }

  // -------------------------------
  // Prepare Date & Time
  // -------------------------------

  const day =
    queryParams.day ||
    formatWithLeadingZero(new Date(profile.birthDate).getDate());

  const month =
    queryParams.month ||
    formatWithLeadingZero(new Date(profile.birthDate).getMonth() + 1);

  const year = queryParams.year || new Date(profile.birthDate).getFullYear();

  const hour =
    queryParams.hour ||
    (profile ? convertTo24Hour(profile.birthTime).split(":")[0] : null);

  const min =
    queryParams.min ||
    (profile ? convertTo24Hour(profile.birthTime).split(":")[1] : null);

  // -------------------------------
  // API Format
  // -------------------------------

  const dob = `${day}-${month}-${year}`; // DD-MM-YYYY
  const tob = `${hour}:${min}`; // HH:mm

  // -------------------------------
  // Final API Params
  // -------------------------------

  const apiParams = {
    dob,
    tob,

    tz: queryParams.tz || profile?.timezone || 5.5,

    lang: queryParams.lang || profile?.preferredLanguage || "en",

    name: queryParams.name || profile?.name || "User",

    birthPlace: queryParams.birthPlace || profile?.birthPlace?.trim(),
  };

  logger.info(`Kundli Details API params: ${JSON.stringify(apiParams)}`);

  // -------------------------------
  // API Call
  // -------------------------------

  const apiUrl = API.KUNDLI_DETAILS(apiParams);

  logger.info(`Fetching Kundli Details data from API: ${apiUrl}`);

  try {
    response = await axios.get(apiUrl, {
      headers: getSaasHeaders(),
      timeout: 15000,
    });
  } catch (apiError) {
    logger.error(
      `Kundli Details API error: ${apiError.message}`,
      apiError.response?.data || {},
    );
    throw new Error("Failed to fetch Kundli Details from astrology API");
  }
  logger.info(`Kundli Details data fetched successfully`);

  // -------------------------------
  // Cache
  // -------------------------------

  await CacheService.set(cacheKey, response.data, 48 * 60 * 60);

  logger.info(
    `Cached Kundli Details data for userId=${userId} with 48 hours TTL`,
  );
  return response.data;
};

const getKPDetails = async (
  userId,
  queryParams = {},
  isRelative = false,
  useQueryParams = false,
) => {
  logger.info(
    `getKPDetails called userId=${userId}, isRelative=${isRelative}, useQueryParams=${useQueryParams}`,
  );

  if (
    (queryParams.dob && queryParams.tob) ||
    (queryParams.day &&
      queryParams.month &&
      queryParams.year &&
      queryParams.hour &&
      queryParams.min)
  ) {
    useQueryParams = true;
  }

  const cacheKey = CacheService.generateKey(
    CacheService.CACHE_PREFIXES.USER_DETAILS,
    "kundli-KP",
    userId || "guest",
    JSON.stringify({
      ...queryParams,
      isRelative,
      useQueryParams,
    }),
  );

  const cachedData = await CacheService.get(cacheKey);

  if (cachedData) {
    logger.info("Returning KP data from cache");
    return cachedData;
  }

  const cleanTOB = (tob) => {
    if (!tob) return null;

    // HH:mm:ss → HH:mm
    if (/^\d{1,2}:\d{1,2}:\d{1,2}$/.test(tob)) {
      return tob.split(":").slice(0, 2).join(":");
    }

    // HH:mm
    if (/^\d{1,2}:\d{1,2}$/.test(tob)) {
      return tob;
    }

    return null;
  };

  if (useQueryParams) {
    const converted = convertToDobTob({
      dob: queryParams.dob,
      tob: queryParams.tob,

      day: queryParams.day,
      month: queryParams.month,
      year: queryParams.year,
      hour: queryParams.hour,
      min: queryParams.min,
    });

    if (!converted) {
      throw new Error("Invalid date/time in query params");
    }

    const finalTob = cleanTOB(converted.tob);

    if (!finalTob) {
      throw new Error("Invalid time format");
    }

    const apiParams = {
      dob: converted.dob,
      tob: finalTob,

      tz: queryParams.tz || 5.5,
      birthPlace: queryParams.birthPlace,
      lang: queryParams.lang || "en",
    };

    const apiUrl = API.KP_DETAILS(apiParams);

    logger.info(`[KP] Fetching via query params: ${apiUrl}`);

    const response = await axios.get(apiUrl, {
      headers: getSaasHeaders(),
      timeout: 15000,
    });

    await CacheService.set(cacheKey, response.data, 48 * 60 * 60);

    return response.data;
  }

  // ====================================================
  // MODE 2: PROFILE / RELATIVE MODE
  // ====================================================

  let profile = null;

  if (isRelative) {
    profile = await UserAstrology.findById(userId);
  } else {
    profile = await UserAstrology.findOne({
      userId,
      relationshipToOwner: "self",
    });
  }

  if (!profile) {
    throw new Error("Astrology profile not found");
  }

  if (!profile.birthDate || !profile.birthTime || !profile.birthPlace) {
    throw new Error("Missing birth details in profile");
  }

  const converted = convertToDobTob({
    dob: queryParams.dob,
    tob: queryParams.tob,

    day: queryParams.day,
    month: queryParams.month,
    year: queryParams.year,
    hour: queryParams.hour,
    min: queryParams.min,

    dateObj: profile.birthDate,
  });

  if (!converted) {
    throw new Error("Invalid DOB / TOB format");
  }

  const finalDob = converted.dob;

  let finalTob = converted.tob || convertTo24Hour(profile.birthTime);

  finalTob = cleanTOB(finalTob);

  if (!finalTob) {
    throw new Error("Invalid time format");
  }

  const tz =
    queryParams.tz ||
    profile?.timezone ||
    -new Date(profile.birthDate).getTimezoneOffset() / 60;

  const birthPlace =
    queryParams.birthPlace || profile.birthPlace.trim().split(",")[0];

  const apiParams = {
    dob: finalDob,
    tob: finalTob,
    tz,
    birthPlace,
    lang: queryParams.lang || profile?.preferredLanguage || "en",
  };

  logger.info(`[KP] API Params: ${JSON.stringify(apiParams)}`);

  const apiUrl = API.KP_DETAILS(apiParams);

  logger.info(`[KP] Fetching via profile: ${apiUrl}`);

  const response = await axios.get(apiUrl, {
    headers: getSaasHeaders(),
    timeout: 15000,
  });

  logger.info("KP API data fetched");

  if (response.data?.success && !isRelative) {
    await updateUserAstrologyWithKundli(userId, response.data);
  }

  await CacheService.set(cacheKey, response.data, 48 * 60 * 60);

  logger.info("KP data cached for 48 hours");

  return response.data;
};

const getAshtakvargaCharts = async (
  userId,
  style = "north",
  queryParams = {},
  isRelative = false,
  useQueryParams = false,
) => {
  try {
    logger.info(`getAshtakvargaCharts called userId=${userId}, style=${style}`);

    if (
      (queryParams?.dob && queryParams?.tob) ||
      (queryParams?.day &&
        queryParams?.month &&
        queryParams?.year &&
        queryParams?.hour &&
        queryParams?.min)
    ) {
      useQueryParams = true;
    }

    const cacheKey = CacheService.generateKey(
      CacheService.CACHE_PREFIXES.USER_DETAILS,
      "kundli-Ashtakvarga",
      userId || "guest",
      style,
      JSON.stringify({ ...queryParams, isRelative, useQueryParams }),
    );

    const cachedData = await CacheService.get(cacheKey);
    if (cachedData) {
      logger.info("Returning Ashtakvarga data from cache");
      return cachedData;
    }

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

    if (useQueryParams) {
      const converted = convertToDobTob({
        dob: queryParams?.dob,
        tob: queryParams?.tob,
        day: queryParams?.day,
        month: queryParams?.month,
        year: queryParams?.year,
        hour: queryParams?.hour,
        min: queryParams?.min,
      });

      if (!converted || !converted.dob) {
        throw new Error("Invalid date/time in query params");
      }

      const finalTob = cleanTOB(converted.tob);
      if (!finalTob) throw new Error("Invalid time format");

      const apiParams = {
        dob: converted.dob,
        tob: finalTob,
        tz: queryParams?.tz || 5.5,
        birthPlace: queryParams?.birthPlace,
        style,
        lang: queryParams?.lang || "en",
      };

      const apiUrl = API.ASHTAKVARGA_CHARTS(apiParams);

      const response = await axios.get(apiUrl, {
        headers: getSaasHeaders(),
        timeout: 15000,
      });

      await CacheService.set(cacheKey, response.data, 48 * 60 * 60);
      return response.data;
    }

    let profile = null;

    if (isRelative) {
      profile = await UserAstrology.findById(userId);
    } else {
      profile = await UserAstrology.findOne({
        userId,
        relationshipToOwner: "self",
      });
    }

    if (!profile) {
      throw new Error("Astrology profile not found");
    }
    if (!profile.birthDate || !profile.birthTime || !profile.birthPlace) {
      throw new Error("Missing birth details in profile");
    }

    const converted = convertToDobTob({
      dob: queryParams?.dob,
      tob: queryParams?.tob,
      day: queryParams?.day,
      month: queryParams?.month,
      year: queryParams?.year,
      hour: queryParams?.hour,
      min: queryParams?.min,
      dateObj: profile.birthDate,
    });

    if (!converted || !converted.dob) {
      throw new Error("Invalid DOB / TOB conversion failed");
    }

    let finalTob = converted.tob || convertTo24Hour(profile.birthTime);

    finalTob = cleanTOB(finalTob);
    if (!finalTob) throw new Error("Invalid time format");

    const tz =
      queryParams?.tz ||
      profile?.timezone ||
      -new Date(profile.birthDate).getTimezoneOffset() / 60;

    const birthPlace =
      queryParams?.birthPlace || profile.birthPlace?.trim()?.split(",")[0];

    const apiParams = {
      dob: converted.dob,
      tob: finalTob,
      tz,
      birthPlace,
      style,
      lang: queryParams?.lang || "en",
    };

    const apiUrl = API.ASHTAKVARGA_CHARTS(apiParams);

    const response = await axios.get(apiUrl, {
      headers: getSaasHeaders(),
      timeout: 15000,
    });

    if (response.data?.success && !isRelative) {
      await updateUserAstrologyWithKundli(userId, response.data);
    }

    await CacheService.set(cacheKey, response.data, 48 * 60 * 60);

    return response.data;
  } catch (error) {
    logger.warn(`[getAshtakvargaCharts] Failed: ${error.message}`);
    throw error;
  }
};
const getCharts = async (
  userId,
  div = "D1",
  style = "north",
  lang = "en",
  queryParams = {},
  isRelative = false,
  useQueryParams = false,
) => {
  logger.info(
    `getCharts called userId=${userId}, div=${div}, style=${style}, lang=${lang}, isRelative=${isRelative}, useQueryParams=${useQueryParams}`,
  );

  // ===============================
  // AUTO ENABLE QUERY MODE
  // ===============================
  if (
    (queryParams.dob && queryParams.tob) ||
    (queryParams.day &&
      queryParams.month &&
      queryParams.year &&
      queryParams.hour &&
      queryParams.min)
  ) {
    useQueryParams = true;
  }

  // ===============================
  // Cache Key
  // ===============================
  const cacheKey = CacheService.generateKey(
    CacheService.CACHE_PREFIXES.USER_DETAILS,
    "kundli-charts",
    div,
    style,
    lang,
    userId || "guest",
    JSON.stringify({
      ...queryParams,
      isRelative,
      useQueryParams,
    }),
  );

  const cachedData = await CacheService.get(cacheKey);

  if (cachedData) {
    logger.info("Returning chart data from cache");
    return cachedData;
  }

  // ===============================
  // Helper: Clean TOB
  // ===============================
  const cleanTOB = (tob) => {
    if (!tob) return null;

    // HH:mm:ss → HH:mm
    if (/^\d{1,2}:\d{1,2}:\d{1,2}$/.test(tob)) {
      return tob.split(":").slice(0, 2).join(":");
    }

    // HH:mm
    if (/^\d{1,2}:\d{1,2}$/.test(tob)) {
      return tob;
    }

    return null;
  };

  // ====================================================
  // MODE 1: DIRECT QUERY MODE (Guest / Manual Input)
  // ====================================================
  if (useQueryParams) {
    const converted = convertToDobTob({
      dob: queryParams.dob,
      tob: queryParams.tob,

      day: queryParams.day,
      month: queryParams.month,
      year: queryParams.year,
      hour: queryParams.hour,
      min: queryParams.min,
    });

    if (!converted) {
      throw new Error("Invalid date/time in query params");
    }

    const finalTob = cleanTOB(converted.tob);

    if (!finalTob) {
      throw new Error("Invalid time format");
    }

    const apiParams = {
      dob: converted.dob,
      tob: finalTob,

      tz: queryParams.tz || 5.5,
      birthPlace: queryParams.birthPlace,

      div,
      style,
      lang,
    };

    const apiUrl = API.CHARTS(apiParams);

    logger.info(`[Charts] Fetching via query params: ${apiUrl}`);

    const response = await axios.get(apiUrl, {
      headers: getSaasHeaders(),
      timeout: 15000,
    });

    await CacheService.set(cacheKey, response.data, 48 * 60 * 60);

    return response.data;
  }

  // ====================================================
  // MODE 2: PROFILE / RELATIVE MODE
  // ====================================================

  let profile = null;

  if (isRelative) {
    profile = await UserAstrology.findById(userId);
  } else {
    profile = await UserAstrology.findOne({
      userId,
      relationshipToOwner: "self",
    });
  }

  if (!profile) {
    throw new Error("Astrology profile not found");
  }

  if (!profile.birthDate || !profile.birthTime || !profile.birthPlace) {
    throw new Error("Missing birth details in profile");
  }

  // ===============================
  // Convert DOB / TOB
  // ===============================

  const converted = convertToDobTob({
    dob: queryParams.dob,
    tob: queryParams.tob,

    day: queryParams.day,
    month: queryParams.month,
    year: queryParams.year,
    hour: queryParams.hour,
    min: queryParams.min,

    dateObj: profile.birthDate,
  });

  if (!converted) {
    throw new Error("Invalid DOB / TOB format");
  }

  const finalDob = converted.dob;

  let finalTob = converted.tob || convertTo24Hour(profile.birthTime);

  finalTob = cleanTOB(finalTob);

  if (!finalTob) {
    throw new Error("Invalid time format");
  }

  // ===============================
  // Timezone
  // ===============================
  const tz =
    queryParams.tz ||
    profile?.timezone ||
    -new Date(profile.birthDate).getTimezoneOffset() / 60;

  // ===============================
  // Birth Place
  // ===============================
  const birthPlace =
    queryParams.birthPlace || profile.birthPlace.trim().split(",")[0];

  // ===============================
  // API Params
  // ===============================

  const apiParams = {
    dob: finalDob,
    tob: finalTob,
    tz,
    birthPlace,

    div,
    style,
    lang,
  };

  logger.info(`[Charts] API Params: ${JSON.stringify(apiParams)}`);

  // ===============================
  // API Call
  // ===============================

  const apiUrl = API.CHARTS(apiParams);

  logger.info(`[Charts] Fetching via profile: ${apiUrl}`);

  const response = await axios.get(apiUrl, {
    headers: getSaasHeaders(),
    timeout: 15000,
  });

  logger.info("Charts API data fetched");

  // ===============================
  // Save (Only Main User)
  // ===============================

  if (response.data?.success && !isRelative) {
    await updateUserAstrologyWithKundli(userId, response.data);
  }

  // ===============================
  // Cache
  // ===============================

  await CacheService.set(cacheKey, response.data, 48 * 60 * 60);

  logger.info("Charts data cached for 48 hours");

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
) => {
  const pad = (v) => String(v).padStart(2, "0");

  let dob;
  let tob;
  let apiParams;
  let profile = null;

  // ===============================
  // QUERY MODE (Guest or Manual Input)
  // ===============================
  if (useQueryParams) {
    dob = `${pad(day)}-${pad(month)}-${year}`;
    tob = `${pad(hour)}:${pad(min)}`;

    apiParams = {
      dob,
      tob,
      tz: tz || 5.5,
      lang: lang || "en",
      name: name || "User",
      birthPlace: location,
    };
  } else {
    // ===============================
    // TOKEN MODE (Logged In User)
    // ===============================
    if (!userId) {
      throw new Error("User ID required if not using query params");
    }

    profile = await UserAstrology.findOne({
      userId,
      relationshipToOwner: "self",
    });

    if (!profile) {
      throw new Error("Astrology profile not found for user");
    }

    const {
      name: profileName = "User",
      birthDate,
      birthTime,
      birthPlace,
      timezone,
      preferredLanguage,
    } = profile;

    if (!birthDate || !birthTime || !birthPlace) {
      throw new Error("Missing birth details in profile");
    }

    // DOB
    const birthDateObj = new Date(birthDate);

    dob = `${pad(birthDateObj.getDate())}-${pad(
      birthDateObj.getMonth() + 1,
    )}-${birthDateObj.getFullYear()}`;

    // TOB
    const [h, m] = convertTo24Hour(birthTime).split(":");

    tob = `${pad(h)}:${pad(m)}`;

    apiParams = {
      dob,
      tob,
      tz: timezone || 5.5,
      lang: preferredLanguage || "en",
      name: profileName,
      birthPlace: birthPlace.trim(),
    };
  }

  logger.info(`Dasha API params: ${JSON.stringify(apiParams)}`);

  // ===============================
  // SAFE CACHE KEY (Guest Supported)
  // ===============================
  const cacheKey = CacheService.generateKey(
    CacheService.CACHE_PREFIXES.USER_DETAILS,
    `dasha-${userId || "guest"}-${apiParams.lang}-${apiParams.name}-${dob}-${tob}-${apiParams.birthPlace}`,
    userId || "guest",
  );

  const cachedData = await CacheService.get(cacheKey);

  if (cachedData) {
    logger.info(`Dasha Cache hit`);
    return cachedData;
  }

  // ===============================
  // CALL API
  // ===============================
  const apiUrl = API.DASHA(apiParams);

  logger.info(`Fetching Dasha data from API: ${apiUrl}`);

  const response = await axios.get(apiUrl, {
    headers: getSaasHeaders(),
    timeout: 15000,
  });

  logger.info(`Dasha data fetched successfully`);

  // ===============================
  // UPDATE DB (Only Logged User)
  // ===============================
  if (profile && response.data?.success) {
    await updateUserAstrologyWithKundli(userId, response.data);
  }

  // ===============================
  // CACHE
  // ===============================
  await CacheService.set(cacheKey, response.data, 48 * 60 * 60);

  logger.info(`Cached Dasha`);

  return response.data;
};

const getAscendantReport = async (
  userId,
  queryParams = {},
  isRelative = false,
  useQueryParams = false,
) => {
  try {
    logger.info(
      `getAscendantReport called userId=${userId}, isRelative=${isRelative}, useQueryParams=${useQueryParams}`,
    );
    const lang = queryParams.lang || "en";
    if (
      (queryParams.dob && queryParams.tob) ||
      (queryParams.day &&
        queryParams.month &&
        queryParams.year &&
        queryParams.hour &&
        queryParams.min)
    ) {
      useQueryParams = true;
    }

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
    if (useQueryParams) {
      const converted = convertToDobTob({
        dob: queryParams.dob,
        tob: queryParams.tob,
        day: queryParams.day,
        month: queryParams.month,
        year: queryParams.year,
        hour: queryParams.hour,
        min: queryParams.min,
      });

      if (!converted) {
        throw new Error("Invalid date/time in query params");
      }

      const finalTob = cleanTOB(converted.tob);
      if (!finalTob) {
        throw new Error("Invalid time format");
      }

      const finalTZ = queryParams.tz || 5.5;
      const finalPlace = queryParams.birthPlace;
      const finalName = queryParams.name || "User";

      if (!finalPlace) {
        throw new Error("Birth place is required");
      }

      const cacheKey = CacheService.generateKey(
        CacheService.CACHE_PREFIXES.USER_DETAILS,
        "ascendant",
        lang,
        converted.dob,
        finalTob,
        finalPlace,
        finalTZ,
        "guest",
      );

      const cached = await CacheService.get(cacheKey);
      if (cached) {
        logger.info("Ascendant returned from cache");
        return cached;
      }

      // ================= API =================
      const apiUrl = API.ASCENDANT_REPORT({
        dob: converted.dob,
        tob: finalTob,
        birthPlace: finalPlace,
        tz: finalTZ,
        name: finalName,
        lang,
      });

      logger.info(`[Ascendant] Fetching via query: ${apiUrl}`);

      const response = await axios.get(apiUrl, {
        headers: getSaasHeaders(),
        // timeout: 15000,
      });

      await CacheService.set(cacheKey, response.data, 48 * 60 * 60);

      return response.data;
    }

    let profile = null;

    if (isRelative) {
      profile = await UserAstrology.findById(userId);
    } else {
      profile = await UserAstrology.findOne({
        userId,
        relationshipToOwner: "self",
      });
    }

    if (!profile) {
      throw new Error("Astrology profile not found");
    }

    if (!profile.birthDate || !profile.birthTime || !profile.birthPlace) {
      throw new Error("Missing birth details in profile");
    }

    const converted = convertToDobTob({
      dateObj: profile.birthDate,
    });

    if (!converted) {
      throw new Error("Invalid DOB format");
    }

    const finalDob = converted.dob;

    let finalTob = convertTo24Hour(profile.birthTime);
    finalTob = cleanTOB(finalTob);

    if (!finalTob) {
      throw new Error("Invalid time format");
    }

    const finalTZ =
      queryParams.tz ||
      profile?.timezone ||
      -new Date(profile.birthDate).getTimezoneOffset() / 60;

    const finalPlace =
      queryParams.birthPlace || profile.birthPlace.trim().split(",")[0];

    const finalName = queryParams.name || profile.name || "User";

    // ================= CACHE =================
    const cacheKey = CacheService.generateKey(
      CacheService.CACHE_PREFIXES.USER_DETAILS,
      "ascendant",
      lang,
      finalDob,
      finalTob,
      finalPlace,
      finalTZ,
      userId,
    );

    const cached = await CacheService.get(cacheKey);
    if (cached) {
      logger.info("Ascendant returned from cache");
      return cached;
    }

    // ================= API =================
    const apiUrl = API.ASCENDANT_REPORT({
      dob: finalDob,
      tob: finalTob,
      birthPlace: finalPlace,
      tz: finalTZ,
      name: finalName,
      lang,
    });

    logger.info(`[Ascendant] Fetching via profile: ${apiUrl}`);

    const response = await axios.get(apiUrl, {
      headers: getSaasHeaders(),
      timeout: 15000,
    });

    if (response.data?.success && !isRelative) {
      await updateUserAstrologyWithKundli(userId, response.data);
    }

    await CacheService.set(cacheKey, response.data, 48 * 60 * 60);

    logger.info("Ascendant cached");

    return response.data;
  } catch (err) {
    logger.error("[ASCENDANT ERROR]", err.response?.data || err.message);
    throw err;
  }
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
  try {
    logger.info(`getFullNumerology called for userId=${userId}`);

    let { name, dob, tob, tz, birthplace, lang } = queryParams;

    const userProvided = name || dob || tob || tz || birthplace;

    if (!userProvided) {
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
        throw new Error("Astrology profile not found");
      }

      if (!profile.birthDate || !profile.birthTime || !profile.birthPlace) {
        throw new Error("Missing birth details in profile");
      }

      // Format DOB: DD/MM/YYYY
      const d = new Date(profile.birthDate);

      dob = `${String(d.getDate()).padStart(2, "0")}/${String(
        d.getMonth() + 1,
      ).padStart(2, "0")}/${d.getFullYear()}`;
      console.log("dob");
      // Format TOB: HH:mm
      tob = convertTo24Hour(profile.birthTime);

      tz = profile?.timezone || 5.5;

      birthplace = profile.birthPlace.trim();

      name = profile.name?.trim() || "User";
    } else {
      // DOB Fix (No new Date() ❌)
      if (dob) {
        const parts = dob.split(/[\/-]/);

        if (parts.length !== 3) {
          throw new Error("Invalid DOB format. Use DD/MM/YYYY");
        }

        const [day, month, year] = parts;

        dob = `${String(day).padStart(2, "0")}/${String(month).padStart(
          2,
          "0",
        )}/${year}`;
      }

      // Time fix
      if (tob) {
        tob = convertTo24Hour(tob);
      }

      if (!tz) {
        tz = 5.5;
      }

      if (birthplace) {
        birthplace = birthplace.trim();
      }

      if (name) {
        name = name.trim();
      }
    }

    if (!name || !dob || !birthplace) {
      throw new Error("name, dob and birthplace are required");
    }

    const cacheKey = CacheService.generateKey(
      CacheService.CACHE_PREFIXES.USER_DETAILS,
      "full-numerology",
      userId,
      dob,
      tob || "00:00",
      tz,
      birthplace,
      name,
      lang,
    );

    const cachedData = await CacheService.get(cacheKey);

    if (cachedData) {
      logger.info(`Returning Full Numerology from cache`);
      return cachedData;
    }
    const apiUrl = API.FULL_NUMEROLOGY({
      name,
      dob,
      tob: tob || "00:00",
      tz,
      birthplace,
      lang: lang || "en",
    });

    logger.info(`[NUMEROLOGY] API URL => ${apiUrl}`);

    const response = await axios.get(apiUrl, {
      headers: {
        "x-api-key": process.env.SAAS_API_KEY,
        "Content-Type": "application/json",
      },
    });

    await CacheService.set(
      cacheKey,
      response.data,
      48 * 60 * 60, // 48 hours
    );

    logger.info(`Full Numerology cached`);

    return response.data;
  } catch (error) {
    logger.error(
      "[NUMEROLOGY SERVICE ERROR]",
      error.response?.data || error.message,
    );

    throw new Error(
      error.response?.data?.message ||
        error.message ||
        "Failed to fetch numerology report",
    );
  }
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

  // ===============================
  // DATE / TIME RESOLUTION
  // ===============================
  const dateObj =
    options.year && options.month && options.day
      ? new Date(`${options.year}-${options.month}-${options.day}`)
      : profile
        ? new Date(profile.birthDate)
        : null;

  const hourVal =
    options.hour ||
    (profile ? convertTo24Hour(profile.birthTime).split(":")[0] : "");
  const minVal =
    options.min ||
    (profile ? convertTo24Hour(profile.birthTime).split(":")[1] : "");

  // ===============================
  // 🔁 INTERNAL CONVERSION → dob / tob
  // ===============================
  const dob = dateObj
    ? `${formatWithLeadingZero(dateObj.getDate())}-${formatWithLeadingZero(
        dateObj.getMonth() + 1,
      )}-${dateObj.getFullYear()}`
    : "";

  const tob = `${hourVal}:${minVal}`;

  // ===============================
  // FINAL API PARAMS (dob / tob)
  // ===============================
  const apiParams = {
    dob,
    tob,
    tz: options.tz || (profile ? profile.timezone : 5.5),
    lang: options.lang || (profile ? profile.preferredLanguage : "en"),
    name: options.name || (profile ? profile.name : ""),
    birthPlace:
      options.birthPlace || (profile ? profile.birthPlace.trim() : ""),
    div: options.div || "D1",
    style: options.style || "south",
  };

  logger.info(
    `Sending FullKundli API request with params (converted): ${JSON.stringify(
      apiParams,
    )}`,
  );

  const cacheKey = CacheService.generateKey(
    CacheService.CACHE_PREFIXES.USER_DETAILS,
    `full-kundli-${userId}-${apiParams.lang}-${apiParams.div}-${apiParams.style}-${apiParams.name}-${dob}-${tob}-${apiParams.birthPlace}`,
    userId,
  );

  const cachedData = await CacheService.get(cacheKey);
  if (cachedData) {
    logger.info(`Cache hit for userId=${userId}`);
    return cachedData;
  }

  // ===============================
  // FULL KUNDLI API
  // ===============================
  let fullKundliData;
  try {
    const apiUrl = API.FULL_KUNDLI(apiParams);
    logger.info(`FullKundli API URL: ${apiUrl}`);

    const response = await axios.get(apiUrl, {
      headers: getSaasHeaders(),
      timeout: 15000,
    });

    fullKundliData = response.data;
  } catch (err) {
    logger.error(`Failed to fetch FullKundli API for userId=${userId}`, err);
    throw err;
  }

  // ===============================
  // DOSHA
  // ===============================
  const doshaParams = {
    dob,
    tob,
    birthPlace: apiParams.birthPlace,
    tz: apiParams.tz,
    lang: apiParams.lang,
  };

  logger.info(
    `Sending Dosha API request with params: ${JSON.stringify(doshaParams)}`,
  );

  // const dosha = await getDosha(userId, null, doshaParams, true);

  // ===============================
  // TRANSIT PLANETS
  // ===============================
  const transitParams = {
    ...doshaParams,
    transit_date: options.transit_date || dob,
    transit_time: options.transit_time || "00:00",
    transitPlace: options.transitPlace || apiParams.birthPlace,
    transit_tz: options.transit_tz || apiParams.tz,
    house_type: "placidus",
    zodiac_type: "sidereal",
    direction: "p1_to_p2",
  };

  logger.info(
    `Sending TransitPlanets API request with params: ${JSON.stringify(
      transitParams,
    )}`,
  );

  // const transitPlanets = await getTransitPlanets(
  //   userId,
  //   null,
  //   transitParams,
  //   true,
  // );

  fullKundliData = {
    ...fullKundliData,
    data: {
      ...fullKundliData.data,
      // dosha,
      // transitPlanets,
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

const getCoordinatesByLocation = async (locationName) => {
  const apiKey = process.env.GOOGLE_API_KEY;
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
    locationName,
  )}&key=${apiKey}`;

  const response = await axios.get(url);

  if (!response.data.results.length) {
    throw new Error("Location not found");
  }

  const { lat, lng } = response.data.results[0].geometry.location;
  const formattedAddress = response.data.results[0].formatted_address;

  return { lat, lon: lng, address: formattedAddress };
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
  getCoordinatesByLocation,
  getCompleteKundliByUserId,
};
