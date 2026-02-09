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
const { getSaasHeaders } = require("../../utils/apiHeader");
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

  // Fetch profile
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
    throw new Error("Astrology profile not found for user");
  }

  const cacheKey = CacheService.generateKey(
    CacheService.CACHE_PREFIXES.USER_DETAILS,
    "kundli-basic",
    profile._id.toString(),
    profile.birthDate,
    profile.birthTime,
    profile.birthPlace,
  );

  const cachedData = await CacheService.get(cacheKey);
  if (cachedData) {
    return cachedData;
  }

  if (
    !queryParams.day &&
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
    queryParams.hour || convertTo24Hour(profile.birthTime).split(":")[0];

  const min =
    queryParams.min || convertTo24Hour(profile.birthTime).split(":")[1];

  const dob = `${day}-${month}-${year}`; // DD-MM-YYYY
  const tob = `${hour}:${min}`; // HH:mm

  const apiParams = {
    dob,
    tob,
    tz: queryParams.tz || profile?.timezone || 5.5,
    lang: queryParams.lang || profile?.preferredLanguage || "en",
    name: queryParams.name || profile?.name || "User",
    birthPlace: queryParams.birthPlace || profile?.birthPlace?.trim(),
  };

  logger.info(`Kundli API params: ${JSON.stringify(apiParams)}`);

  const apiUrl = API.KUNDLI(apiParams);

  logger.info(`Fetching Kundli data from API: ${apiUrl}`);

  const response = await axios.get(apiUrl, {
    headers: getSaasHeaders(),
    timeout: 15000,
  });

  logger.info(`Kundli data fetched successfully`);

  if (!profile.isKundli) {
    profile.isKundli = true;
    await profile.save();
  }

  // Update user astrology
  if (response.data && response.data.success && !isRelative) {
    await updateUserAstrologyWithKundli(userId, response.data, false);
  }

  // Cache
  await CacheService.set(cacheKey, response.data, 48 * 60 * 60);

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
      throw new Error("Astrology profile not found for user");
    }

    if (!profile.birthDate || !profile.birthTime || !profile.birthPlace) {
      throw new Error("Missing birth details in profile");
    }
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
    queryParams.hour || convertTo24Hour(profile.birthTime).split(":")[0];

  const min =
    queryParams.min || convertTo24Hour(profile.birthTime).split(":")[1];

  // ✅ Convert to API format
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
  // API Call with Header ✅
  // -------------------------------

  const apiUrl = API.KUNDLI_DETAILS(apiParams);

  logger.info(`Fetching Kundli Details data from API: ${apiUrl}`);

  const response = await axios.get(apiUrl, {
    headers: getSaasHeaders(),
    timeout: 15000,
  });
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

const getKPDetails = async (userId, queryParams = {}) => {
  logger.info(`getKPDetails called for userId=${userId}`);

  const cacheKey = CacheService.generateKey(
    CacheService.CACHE_PREFIXES.USER_DETAILS,
    "kundli-KP",
    userId,
    JSON.stringify(queryParams),
  );

  const cachedData = await CacheService.get(cacheKey);
  if (cachedData) {
    logger.info(`Returning Kundli data from cache for userId=${userId}`);
    return cachedData;
  }

  let profile;
  if (!queryParams.dob) {
    profile = await UserAstrology.findOne({
      userId,
      relationshipToOwner: "self",
    });

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

  // ⭐ Only remove seconds, nothing else
  const cleanTOB = (tob) => {
    if (!tob) return null;

    // If HH:mm:ss → strip seconds
    if (/^\d{1,2}:\d{1,2}:\d{1,2}$/.test(tob)) {
      return tob.split(":").slice(0, 2).join(":");
    }

    // If HH:mm or H:mm → keep as is
    if (/^\d{1,2}:\d{1,2}$/.test(tob)) {
      return tob;
    }

    return null; // invalid format
  };

  // Raw TOB from query or DB
  let tobRaw = queryParams.tob || convertTo24Hour(profile?.birthTime);

  // Clean TOB
  let tob = cleanTOB(tobRaw);

  if (!tob) {
    logger.error(`Invalid TOB format received: ${tobRaw}`);
    throw new Error("Invalid time of birth format. Use HH:mm (Example: 17:56)");
  }

  logger.info(`Cleaned TOB: ${tob}`);

  const apiParams = {
    dob: queryParams.dob || formatDate(profile.birthDate),
    tob,
    tz:
      queryParams.tz ||
      profile?.timezone ||
      -new Date(profile.birthDate).getTimezoneOffset() / 60,
    birthPlace: queryParams.birthPlace || profile?.birthPlace?.trim(),
  };

  logger.info(`KP API params: ${JSON.stringify(apiParams)}`);

  const apiUrl = API.KP_DETAILS(apiParams);
  logger.info(`Fetching Kundli data from API: ${apiUrl}`);

  const response = await axios.get(apiUrl, {
    headers: getSaasHeaders(),
    timeout: 15000,
  });

  logger.info(`Kundli data fetched successfully for userId=${userId}`);

  if (!queryParams.dob) {
    await profile.save();
    logger.info(`Marked profile as Kundli generated for userId=${userId}`);

    if (response.data && response.data.success) {
      await updateUserAstrologyWithKundli(userId, response.data);
    } else {
      logger.warn(`Kundli API response unsuccessful for userId=${userId}`);
    }
  }

  await CacheService.set(cacheKey, response.data, 48 * 60 * 60);
  logger.info(`Cached Kundli data for userId=${userId} with 48 hours TTL`);

  return response.data;
};

const getAshtakvargaCharts = async (
  userId,
  style = "north",
  dob,
  tob,
  tz,
  birthPlace,
  isQuery,
) => {
  logger.info(
    `getAshtakvargaCharts called for userId=${userId}, style=${style}`,
  );

  const cacheKey = CacheService.generateKey(
    CacheService.CACHE_PREFIXES.USER_DETAILS,
    "kundli-Ashtakvarga",
    userId,
  );

  const cachedData = await CacheService.get(cacheKey);
  if (cachedData) {
    logger.info(`Returning Kundli data from cache for userId=${userId}`);
    return cachedData;
  }

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
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // ⭐ Only remove seconds — same behavior as KP
  const cleanTOB = (tob) => {
    if (!tob) return null;

    // HH:mm:ss → HH:mm
    if (/^\d{1,2}:\d{1,2}:\d{1,2}$/.test(tob)) {
      return tob.split(":").slice(0, 2).join(":");
    }

    // HH:mm or H:mm → allowed
    if (/^\d{1,2}:\d{1,2}$/.test(tob)) {
      return tob;
    }

    return null;
  };

  // Set DOB, TOB, TZ, Place from profile
  dob = formatDate(profile.birthDate);

  const hourMin = convertTo24Hour(profile.birthTime);
  tob = cleanTOB(hourMin);

  if (!tob) {
    logger.error(`Invalid TOB format received: ${hourMin}`);
    throw new Error("Invalid time of birth format. Use HH:mm (Example: 17:56)");
  }

  logger.info(`Cleaned TOB: ${tob}`);

  const getTimeZoneOffset = (date) => -new Date(date).getTimezoneOffset() / 60;

  tz = getTimeZoneOffset(profile.birthDate);
  birthPlace = profile.birthPlace.trim();

  const apiUrl = API.ASHTAKVARGA_CHARTS({
    dob,
    tob,
    birthPlace,
    tz,
    style,
  });

  logger.info(`Fetching Kundli data from API: ${apiUrl}`);

  const response = await axios.get(apiUrl, {
    headers: getSaasHeaders(),
    timeout: 15000,
  });
  logger.info(`Kundli data fetched successfully for userId=${userId}`);

  if (!profile.isKundli) {
    await profile.save();
    logger.info(`Marked profile as Kundli generated for userId=${userId}`);
  }

  if (response.data?.success) {
    await updateUserAstrologyWithKundli(userId, response.data);
  } else {
    logger.warn(`Kundli API response unsuccessful for userId=${userId}`);
  }

  await CacheService.set(cacheKey, response.data, 48 * 60 * 60);

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
  isQuery,
) => {
  logger.info(
    `getCharts called for userId=${userId}, div=${div}, style=${style}, lang=${lang}`,
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
  if (!profile.birthDate || !profile.birthTime || !profile.birthPlace) {
    throw new Error("Missing birth details in profile");
  }

  const formatDate = (date) => {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // ⭐ Only remove seconds (HH:mm:ss → HH:mm)
  const cleanTOB = (tob) => {
    if (!tob) return null;

    // If HH:mm:ss → strip seconds → HH:mm
    if (/^\d{1,2}:\d{1,2}:\d{1,2}$/.test(tob)) {
      return tob.split(":").slice(0, 2).join(":");
    }

    // If HH:mm or H:mm → allowed as-is
    if (/^\d{1,2}:\d{1,2}$/.test(tob)) {
      return tob;
    }

    return null; // invalid
  };

  // Convert & clean TOB from DB
  const hourMin = convertTo24Hour(profile.birthTime);
  tob = cleanTOB(hourMin);

  if (!tob) {
    logger.error(`Invalid TOB format received: ${hourMin}`);
    throw new Error("Invalid time of birth format. Use HH:mm (Example: 17:56)");
  }

  logger.info(`Cleaned TOB: ${tob}`);

  const getTimeZoneOffset = (date) => -new Date(date).getTimezoneOffset() / 60;

  dob = formatDate(profile.birthDate);
  tz = getTimeZoneOffset(profile.birthDate);
  birthPlace = profile.birthPlace.trim();

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

  const response = await axios.get(apiUrl, {
    headers: getSaasHeaders(),
    timeout: 15000,
  });
  logger.info(`Chart data fetched successfully for userId=${userId}`);

  if (!profile.isKundli) {
    await profile.save();
    logger.info(`Marked profile as Kundli generated for userId=${userId}`);
  }

  if (response.data?.success) {
    await updateUserAstrologyWithKundli(userId, response.data);
  } else {
    logger.warn(`Chart API response unsuccessful for userId=${userId}`);
  }

  await CacheService.set(cacheKey, response.data, 48 * 60 * 60);
  logger.info(`Cached chart data for userId=${userId} with 48 hours TTL`);

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
  location, // frontend se aata hai
) => {
  const pad = (v) => String(v).padStart(2, "0");

  // ===============================
  // QUERY PARAM MODE
  // ===============================
  if (useQueryParams) {
    const dob = `${pad(day)}-${pad(month)}-${year}`;
    const tob = `${pad(hour)}:${pad(min)}`;

    const apiUrl = API.DASHA({
      dob,
      tob,
      tz: tz || 5.5,
      lang: lang || "en",
      name: name || "User",
      birthPlace: location, // 👈 IMPORTANT
    });

    logger.info(`Fetching Dasha data from API (query params): ${apiUrl}`);

    const response = await axios.get(apiUrl, {
      headers: getSaasHeaders(),
      timeout: 15000,
    });

    return response.data;
  }

  // ===============================
  // PROFILE MODE
  // ===============================
  const profile = await UserAstrology.findOne({
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
  } = profile;

  if (!birthDate || !birthTime || !birthPlace) {
    throw new Error("Missing birth details in profile");
  }

  // 🔁 DOB / TOB conversion from profile
  const birthDateObj = new Date(birthDate);
  const dob = `${pad(birthDateObj.getDate())}-${pad(
    birthDateObj.getMonth() + 1,
  )}-${birthDateObj.getFullYear()}`;

  const [h, m] = convertTo24Hour(birthTime).split(":");
  const tob = `${pad(h)}:${pad(m)}`;

  const tzOffset = -new Date(birthDate).getTimezoneOffset() / 60;

  const apiUrl = API.DASHA({
    dob,
    tob,
    tz: tzOffset,
    lang: "en",
    name: profileName,
    birthPlace: birthPlace.trim(),
  });

  logger.info(`Fetching Dasha data from API (profile): ${apiUrl}`);

  const response = await axios.get(apiUrl, {
    headers: getSaasHeaders(),
    timeout: 15000,
  });

  if (response.data?.success) {
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
  name,
) => {
  try {
    logger.info(`Ascendant for user=${userId}`);

    // ================= PROFILE =================
    let profile;

    if (!isQuery) {
      profile = await UserAstrology.findOne({
        userId,
        relationshipToOwner: "self",
      });
    } else {
      profile = await UserAstrology.findById(userId);
    }

    // if (!profile) {
    //   throw new Error("Astrology profile not found");
    // }

    // ================= HELPERS =================

    // DD/MM/YYYY → DD-MM-YYYY
    const formatDOB = (date) => {
      if (!date) return null;

      if (typeof date === "string" && date.includes("/")) {
        const [d, m, y] = date.split("/");
        return `${d.padStart(2, "0")}-${m.padStart(2, "0")}-${y}`;
      }

      const dt = new Date(date);

      return `${String(dt.getDate()).padStart(2, "0")}-${String(
        dt.getMonth() + 1,
      ).padStart(2, "0")}-${dt.getFullYear()}`;
    };

    // HH:mm only
    const formatTOB = (time) => {
      if (!time) return null;

      if (/^\d{1,2}:\d{2}$/.test(time)) {
        const [h, m] = time.split(":");
        return `${h.padStart(2, "0")}:${m}`;
      }

      if (/^\d{1,2}:\d{2}:\d{2}$/.test(time)) {
        const [h, m] = time.split(":");
        return `${h.padStart(2, "0")}:${m}`;
      }

      return null;
    };

    const getTZ = (date) => -new Date(date).getTimezoneOffset() / 60;

    // ================= FINAL VALUES =================

    const finalDOB = formatDOB(dob || profile.birthDate);

    const finalTOB = formatTOB(tob || convertTo24Hour(profile.birthTime));

    const finalTZ = tz || getTZ(profile.birthDate) || 5.5;

    const finalPlace = birthPlace || profile.birthPlace?.trim();

    const finalName = name || profile.name || "User";

    // ================= VALIDATION =================

    if (!finalDOB || !finalTOB || !finalPlace) {
      throw new Error("Missing DOB / TOB / Place");
    }

    // ================= CACHE KEY (AFTER DATA READY) =================

    const cacheKey = CacheService.generateKey(
      CacheService.CACHE_PREFIXES.USER_DETAILS,
      `ascendant-${lang}-${finalDOB}-${finalTOB}-${finalPlace}-${finalTZ}`,
      userId,
    );

    // const cached = await CacheService.get(cacheKey);

    // if (cached) {
    //   logger.info("Ascendant returned from cache");
    //   return cached;
    // }

    // ================= API =================

    const apiUrl = API.ASCENDANT_REPORT({
      dob: finalDOB,
      tob: finalTOB,
      birthPlace: finalPlace,
      tz: finalTZ,
      name: finalName,
    });

    logger.info(`[Ascendant API] ${apiUrl}`);

    const response = await axios.get(apiUrl, {
      headers: {
        "x-api-key": process.env.SAAS_API_KEY,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    });

    // ================= UPDATE SELF =================

    // if (response.data?.success && !isQuery) {
    //   await updateUserAstrologyWithKundli(userId, response.data);
    // }
    if (response.data?.success && userId && !isQuery) {
      await updateUserAstrologyWithKundli(userId, response.data);
    }

    // ================= SAVE CACHE =================

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

    let { name, dob, tob, tz, birthplace } = queryParams;

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
