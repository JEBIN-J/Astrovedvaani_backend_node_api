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
const Enums = require("../../utils/constants");
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

const normalizeParams = (queryParams = {}, profile = {}) => {
  const pad = (v) => String(v).padStart(2, "0");

  // Convert 12-hour time to 24-hour time if needed
  const normalizeTime = (time = "00:00") => {
    if (!time) return "00:00";

    const trimmed = time.trim();

    // Match formats like:
    // 03:36 PM
    // 3:36 PM
    // 03:36PM
    const match = trimmed.match(
      /^(\d{1,2}):(\d{2})\s?(AM|PM)$/i,
    );

    // Already in 24-hour format
    if (!match) {
      const [h = "00", m = "00"] = trimmed.split(":");
      return `${pad(h)}:${pad(m)}`;
    }

    let [, hours, minutes, meridian] = match;

    hours = parseInt(hours, 10);
    meridian = meridian.toUpperCase();

    if (meridian === "PM" && hours !== 12) {
      hours += 12;
    }

    if (meridian === "AM" && hours === 12) {
      hours = 0;
    }

    return `${pad(hours)}:${minutes}`;
  };

  let dob;
  let tob;

  // ===============================
  // CASE 1 → dob/tob format given
  // ===============================
  if (queryParams.dob) {
    dob = queryParams.dob.replace(/\//g, "-");
    tob = normalizeTime(queryParams.tob || "00:00");
  }

  // ===============================
  // CASE 2 → day/month/year format
  // ===============================
  else if (queryParams.day) {
    dob = `${pad(queryParams.day)}-${pad(queryParams.month)}-${queryParams.year}`;

    tob = normalizeTime(
      `${pad(queryParams.hour)}:${pad(queryParams.min)} ${
        queryParams.ampm || ""
      }`.trim(),
    );
  }

  // ===============================
  // CASE 3 → From Profile
  // ===============================
  else {
    const birthDate = new Date(profile.birthDate);

    dob = `${pad(birthDate.getDate())}-${pad(
      birthDate.getMonth() + 1,
    )}-${birthDate.getFullYear()}`;

    tob = normalizeTime(profile.birthTime);
  }

  return {
    dob,
    tob,
    tz:
      queryParams.tz ||
      profile?.timezone ||
      -new Date(profile?.birthDate || Date.now()).getTimezoneOffset() / 60,

    lang: queryParams.lang || profile?.preferredLanguage || "en",

    name: queryParams.name || profile?.name || "User",

    birthPlace:
      queryParams.birthPlace ||
      queryParams.location ||
      profile?.birthPlace?.trim(),
  };
};

// =====================================================
// 🔥 COMMON PROFILE FETCHER
// =====================================================

const getProfile = async (userId, isRelative, role) => {
  console.log("isRelative", isRelative);
  console.log("userID", userId);
  console.log("role", role);
  if (isRelative) {
    if (role === Enums.USER.ROLE.ASTROLOGER) {
      console.log("Fetching profile by ID for astrologer",role);
    return await UserAstrology.findOne({userId});
    }
    else if (role === Enums.USER.ROLE.USER) {
      console.log("Fetching profile by ID for relative",role);
      return await UserAstrology.findById(userId);
    }
  }

  return await UserAstrology.findOne({
    userId,
    relationshipToOwner: "self",
  });
};

const callApi = async (apiUrl) => {
  const response = await axios.get(apiUrl, {
    headers: getSaasHeaders(),
    // timeout: 15000,
  });

  return response;
};
const getKundliData = async (userId, queryParams = {}, isRelative = false) => {
  logger.info(
    `getKundliData called for userId=${userId}, isRelative=${isRelative}`,
  );

  // Fetch profile
  const profile = await getProfile(userId, isRelative);
  if (!profile) throw new Error("Astrology profile not found");

  const params = normalizeParams(queryParams, profile);

  console.log("User profile found:", profile);

  const cacheKey = CacheService.generateKey(
    CacheService.CACHE_PREFIXES.USER_DETAILS,
    "kundli-basic",
    userId,
    JSON.stringify(params),
  );

  const cachedData = await CacheService.get(cacheKey);
  if (cachedData) {
    return cachedData;
  }

  const cached = await CacheService.get(cacheKey);
  if (cached) return cached;

  const apiUrl = API.KUNDLI(params);
  const response = await callApi(apiUrl);

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
const getKundliDetailsData = async (
  userId,
  queryParams = {},
  isRelative = false,
) => {
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

  const profile = await getProfile(userId, isRelative);
  if (!profile) throw new Error("Astrology profile not foundsasa");

  // -------------------------------
  // Prepare Date & Time
  // -------------------------------

  const params = normalizeParams(queryParams, profile);

  // -------------------------------
  // API Call with Header ✅
  // -------------------------------

  const apiUrl = API.KUNDLI_DETAILS(params);

  logger.info(`Fetching Kundli Details data from API: ${apiUrl}`);

  const response = await callApi(apiUrl);
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

const getKPDetails = async (userId, queryParams = {}, isRelative = false) => {
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

  const profile = await getProfile(userId, isRelative);
  if (!profile) throw new Error("Astrology profile not found");

  const params = normalizeParams(queryParams, profile);

  const apiUrl = API.KP_DETAILS(params);
  logger.info(`Fetching Kundli data from API: ${apiUrl}`);

  const response = await callApi(apiUrl);

  logger.info(`Kundli data fetched successfully for userId=${userId}`);

  // if (!queryParams.dob) {
  //   await profile.save();
  //   logger.info(`Marked profile as Kundli generated for userId=${userId}`);

  //   if (response.data && response.data.success) {
  //     await updateUserAstrologyWithKundali(userId, response.data);
  //   } else {
  //     logger.warn(`Kundli API response unsuccessful for userId=${userId}`);
  //   }
  // }

  await CacheService.set(cacheKey, response.data, 48 * 60 * 60);
  logger.info(`Cached Kundli data for userId=${userId} with 48 hours TTL`);

  return response.data;
};

const getAshtakvargaChartDetails = async (
  userId,
  queryParams = {},
  isRelative = false,
) => {
  logger.info(`getAshtakvargaChartDetails called for userId=${userId}`);

  const profile = await getProfile(userId, isRelative);
  if (!profile) throw new Error("Astrology profile not found");

  const params = normalizeParams(queryParams, profile);

  const cacheKey = CacheService.generateKey(
    CacheService.CACHE_PREFIXES.USER_DETAILS,
    "kundli-Ashtakvarga",
    userId,
    JSON.stringify(params),
  );

  const cachedData = await CacheService.get(cacheKey);
  if (cachedData) {
    logger.info(`Returning Kundli data from cache for userId=${userId}`);
    return cachedData;
  }

  const apiUrl = API.ASHTAKVARGA_CHARTS({
    ...params,
    style: queryParams.style || "north",
  });

  logger.info(`Fetching Kundli data from API: ${apiUrl}`);

  const response = await callApi(apiUrl);
  logger.info(`Kundli data fetched successfully for userId=${userId}`);

  // if (!profile.isKundli) {
  //   await profile.save();
  //   logger.info(`Marked profile as Kundli generated for userId=${userId}`);
  // }

  // if (response.data?.success) {
  //   await updateUserAstrologyWithKundli(userId, response.data);
  // } else {
  //   logger.warn(`Kundli API response unsuccessful for userId=${userId}`);
  // }

  await CacheService.set(cacheKey, response.data, 48 * 60 * 60);

  return response.data;
};

const getChartDetails = async (
  userId,
  queryParams = {},
  isRelative = false,
) => {
  logger.info(`getChartDetails called for userId=${userId}`);

  const profile = await getProfile(userId, isRelative);
  if (!profile) throw new Error("Astrology profile not found");

  const params = normalizeParams(queryParams, profile);

  console.log("params for chart details:", params);
  const cacheKey = CacheService.generateKey(
    CacheService.CACHE_PREFIXES.USER_DETAILS,
    `kundli-charts`,
    userId,
    JSON.stringify(params),
  );

  const cachedData = await CacheService.get(cacheKey);
  if (cachedData) {
    logger.info(`Returning chart data from cache for userId=${userId}`);
    return cachedData;
  }

  const apiUrl = API.CHARTS({
    ...params,
    div: queryParams.div || "D1",
    style: queryParams.style || "north",
  });
  logger.info(`Fetching chart data from API: ${apiUrl}`);

  const response = await callApi(apiUrl);
  logger.info(`Chart data fetched successfully for userId=${userId}`);

  // if (!profile.isKundli) {
  //   await profile.save();
  //   logger.info(`Marked profile as Kundli generated for userId=${userId}`);
  // }

  // if (response.data?.success) {
  //   await updateUserAstrologyWithKundli(userId, response.data);
  // } else {
  //   logger.warn(`Chart API response unsuccessful for userId=${userId}`);
  // }

  await CacheService.set(cacheKey, response.data, 48 * 60 * 60);
  logger.info(`Cached chart data for userId=${userId} with 48 hours TTL`);

  return response.data;
};

const getDasha = async (userId, queryParams = {}, isRelative = false) => {
  const profile = await getProfile(userId, isRelative);
  if (!profile) throw new Error("Astrology profile not found");

  const params = normalizeParams(queryParams, profile);

  const apiUrl = API.DASHA(params);

  logger.info(`Fetching Dasha data from API (profile): ${apiUrl}`);

  const response = await callApi(apiUrl);

  // if (response.data?.success) {
  //   await updateUserAstrologyWithKundli(userId, response.data);
  // }

  const cacheKey = CacheService.generateKey(
    CacheService.CACHE_PREFIXES.USER_DETAILS,
    `dasha-details`,
    userId,
    JSON.stringify(params),
  );

  await CacheService.set(cacheKey, response.data, 48 * 60 * 60);

  return response.data;
};

const getAscendantReport = async (
  userId,
  queryParams = {},
  isRelative = false,
) => {
  try {
    const profile = await getProfile(userId, isRelative);
    if (!profile) throw new Error("Astrology profile not found");

    const params = normalizeParams(queryParams, profile);
    // ================= CACHE KEY (AFTER DATA READY) =================

    const cacheKey = CacheService.generateKey(
      CacheService.CACHE_PREFIXES.USER_DETAILS,
      `ascendant-${params}`,
      userId,
      JSON.stringify(params),
    );

    const cached = await CacheService.get(cacheKey);

    if (cached) {
      logger.info("Ascendant returned from cache");
      return cached;
    }

    // ================= API =================

    console.log("Params for Ascendant Report:", params);

    const apiUrl = API.ASCENDANT_REPORT({
      ...params,
      name: queryParams.name || profile?.name || "User",
    });

    logger.info(`[Ascendant API] ${apiUrl}`);

    const response = await callApi(apiUrl);

    // ================= UPDATE SELF =================

    // if (response.data?.success && !isQuery) {
    //   await updateUserAstrologyWithKundli(userId, response.data);
    // }
    // if (response.data?.success && userId && !isRelative) {
    //   await updateUserAstrologyWithKundli(userId, response.data);
    // }

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
const getFullKundliData = async (
  userId,
  queryParams = {},
  isRelative = false,
  role
) => {
  logger.info(
    `getFullKundliData called for userId=${userId}, isRelative=${isRelative} role=${role}`,
  );

  const profile = await getProfile(userId, isRelative, role);

  console.log("User profile for Full Kundli Data:", profile);

  const baseParams = normalizeParams(queryParams, profile);

  console.log("Normalized Params for Full Kundli Data:", baseParams);

  const div = queryParams.div || "D1";
  const style = queryParams.style || "south";

  const apiParams = {
    ...baseParams,
    div,
    style,
  };

  logger.info(`FullKundli normalized params: ${JSON.stringify(apiParams)}`);

  // ======================================
  // CACHE KEY
  // ======================================
  const cacheKey = CacheService.generateKey(
    CacheService.CACHE_PREFIXES.USER_DETAILS,
    "full-kundli",
    userId,
    JSON.stringify(apiParams),
  );

  const cached = await CacheService.get(cacheKey);
  if (cached) {
    logger.info(`FullKundli cache hit for userId=${userId}`);
    return cached;
  }

  // ===============================
  // FULL KUNDLI API
  // ===============================
  let fullKundliData;
  try {
    const apiUrl = API.FULL_KUNDLI(apiParams);
    logger.info(`FullKundli API URL: ${apiUrl}`);

    const response = await callApi(apiUrl);

    fullKundliData = response.data;
  } catch (err) {
    logger.error(`Failed to fetch FullKundli API for userId=${userId}`, err);
    throw err;
  }

  fullKundliData = {
    ...fullKundliData,
    data: {
      ...fullKundliData.data,
    },
  };

  if (!isRelative && profile && !profile.isKundli) {
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


const getLocationSuggestions = async (input) => {
  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) throw new Error("Google API key missing");

    // Step 1: Autocomplete with new API
    const url = "https://places.googleapis.com/v1/places:autocomplete";
    const response = await axios.post(
      url,
      {
        input,
        includedPrimaryTypes: ["locality"], // Restrict to cities/localities
        languageCode: "en",
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "suggestions.placePrediction.text.text,suggestions.placePrediction.placeId", // Include placeId for details
        },
      }
    );

    const predictions = response.data.suggestions?.map((s) => ({
      text: s.placePrediction.text.text,
      placeId: s.placePrediction.placeId,
    })) || [];

    if (!predictions.length) throw new Error("No suggestions found");

    // Step 2: Fetch details for each prediction in parallel (limit to 5)
    const results = await Promise.all(
      predictions.slice(0, 5).map(async (pred) => {
        try {
          const detailsResponse = await axios.get(
            `https://places.googleapis.com/v1/places/${pred.placeId}`,
            {
              headers: {
                "X-Goog-Api-Key": apiKey,
                "X-Goog-FieldMask": "location,formattedAddress", // Get lat/lon and address
              },
            }
          );
          const { latitude, longitude } = detailsResponse.data.location || {};
          return {
            address: detailsResponse.data.formattedAddress || pred.text,
            lat: latitude,
            lon: longitude,
          };
        } catch (detailsError) {
          console.error(`Error fetching details for place ${pred.placeId}:`, detailsError.message);
          return {
            address: pred.text,
            lat: null,
            lon: null,
          };
        }
      })
    );

    // Filter out failed details fetches
    return results.filter(r => r.lat && r.lon);
  } catch (error) {
    console.error("Error fetching location suggestions:", error.message);
    if (error.response) {
      console.error(
        "Google API Error Details:",
        JSON.stringify(error.response.data, null, 2)
      );
    }
    throw error;
  }
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
  getAshtakvargaChartDetails,
  getChartDetails,
  getDasha,
  getAscendantReport,
  getMonthlyChoghadiya,
  getFullNumerology,
  getChoghadiya,
  getFullKundliData,
  getLocationByCoordinates,
  getCoordinatesByLocation,
  getCompleteKundliByUserId,
  getLocationSuggestions,
};
