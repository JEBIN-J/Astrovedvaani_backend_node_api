const axios = require("axios");
const logger = require("../../utils/logger");
const User = require("../../models/User");
const tithiSchedule = require("../../models/tithiSchedule");
const API = require("./api").default;
const moment = require("moment-timezone");
const TithiSchedule = require("../../models/tithiSchedule");
const CacheService = require("../../utils/redis/cacheService");
const { getSaasHeaders } = require("../../utils/apiHeader");
const formatDateDDMMYYYY = (date) => {
  logger.info(`Raw input date: ${date}`);
  if (!date) {
    logger.warn("No date provided to formatDateDDMMYYYY");
    return "";
  }
  if (typeof date === "string" && /^\d{2}\/\d{2}\/\d{4}$/.test(date)) {
    logger.info(`Date already in DD/MM/YYYY format: ${date}`);
    return date;
  }
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [year, month, day] = date.split("-");
    const formatted = `${day}/${month}/${year}`;
    logger.info(`Converted ISO date to DD/MM/YYYY: ${formatted}`);
    return formatted;
  }
  const d = new Date(date);
  if (!isNaN(d.getTime())) {
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    const formatted = `${day}/${month}/${year}`;
    logger.info(`Formatted JS Date object to: ${formatted}`);
    return formatted;
  }
  logger.error(`Unsupported date format: ${date}`);
  return "";
};

// const getPanchangData = async ({ userId, date, location, tz }) => {
//   logger.info(
//     `getPanchangData called with: date=${date}, location=${location}, tz=${tz}`,
//   );
//   console.log("date, location, tz");
//   const formattedDate = formatDateDDMMYYYY(date);
//   const cacheKey = CacheService.generateKey(
//     CacheService.CACHE_PREFIXES.USER_DETAILS,
//     `panchang-${location}-${formattedDate}`,
//     userId || "guest",
//   );
//   const cachedData = await CacheService.get(cacheKey);
//   if (cachedData) {
//     logger.info(`Returning Panchang from cache for userId=${userId}`);
//     return cachedData;
//   }
//   const apiUrl = API.PANCHANG({ date: formattedDate, location, tz });
//   const apiUrlChogadiya = API.CHOGHADIYA({ date: formattedDate, location });
//   logger.info(`Fetching Panchang data from API: ${apiUrl}`);
//   logger.info(`Fetching Chogadiya data from API: ${apiUrlChogadiya}`);
//   try {
//     const [panchangResponse, chogadiyaResponse] = await Promise.all([
//       axios.get(apiUrl),
//       axios.get(apiUrlChogadiya),
//     ]);
//     const responseData = {
//       ...panchangResponse.data,
//       chogadiya: chogadiyaResponse.data.data,
//     };
//     await CacheService.set(cacheKey, responseData, 24 * 60 * 60);
//     logger.info(`Cached Panchang for userId=${userId}`);
//     return responseData;
//   } catch (error) {
//     logger.error(`Error fetching Panchang/Chogadiya data: ${error.message}`);
//     throw error;
//   }
// };
const getPanchangData = async ({ userId, date, location, tz, lang = "en" }) => {
  logger.info(
    `getPanchangData called with: date=${date}, location=${location}, tz=${tz}, lang=${lang}`,
  );

  const formattedDate = formatDateDDMMYYYY(date);
  const normalizedLocation = location.trim().toLowerCase();

  // ✅ FIXED CACHE KEY
  const cacheKey = CacheService.generateKey(
    CacheService.CACHE_PREFIXES.USER_DETAILS,
    `panchang-${normalizedLocation}-${formattedDate}-${tz}-${lang}`,
    userId || "guest",
  );

  const cachedData = await CacheService.get(cacheKey);

  const fetchAndCache = async () => {
    // Both are calculated by the local astro engine (one shared calculation).
    logger.info(
      `Calculating Panchang + Chogadiya: date=${formattedDate}, location=${location}`,
    );

    const [panchangResponse, chogadiyaResponse] = await Promise.all([
      API.PANCHANG({ date: formattedDate, location, tz, lang }),
      API.CHOGHADIYA({ date: formattedDate, location, lang }),
    ]);

    const responseData = {
      ...panchangResponse.data,
      chogadiya: chogadiyaResponse.data.data,
      // The mobile app reads these at the top level.
      date: chogadiyaResponse.data.data.date,
      choghadiyaMuhurat: chogadiyaResponse.data.data.choghadiyaMuhurat,
    };

    await CacheService.set(cacheKey, responseData, 2 * 60 * 60);
    logger.info(`Cached Panchang for key=${cacheKey}`);

    return responseData;
  };

  if (cachedData && cachedData.sunrise && cachedData.sunset) {
    logger.info(`Returning Panchang from cache, refreshing in background`);
    fetchAndCache().catch((err) =>
      logger.error(`Background refresh failed: ${err.message}`),
    );
    return cachedData;
  }

  return fetchAndCache();
};

const getCityFromCoords = async (lat, lon) => {
  const apiKey = process.env.GOOGLE_API_KEY;
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${apiKey}`;
  const res = await axios.get(url);

  if (res.data.results.length > 0) {
    const components = res.data.results[0].address_components;
    const city = components.find((c) =>
      c.types.includes("locality"),
    )?.long_name;
    return city || res.data.results[0].formatted_address;
  }
  return `${lat},${lon}`;
};

const scheduleTithi = async (userId, date, email = null, location, tz) => {
  if (!userId || !date) throw new Error("userId and date are required");

  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  // ✅ Already scheduled check
  const existing = await tithiSchedule.findOne({ userId, date });
  if (existing) {
    return {
      alreadyExists: true,
      message: "Schedule already exists for this date",
    };
  }
  // Panchang data
  const panchangData = await getPanchangData({ date, location, tz });
  if (!panchangData?.panchang?.tithi) {
    throw new Error("Failed to fetch Tithi from Panchang data");
  }

  // Final email (from param or user profile)
  const finalEmail = email || user.email;

  // Save new schedule
  const schedule = new tithiSchedule({
    userId: user._id,
    email: finalEmail,
    date,
    tithi: panchangData.panchang.tithi,
    specialTithi: panchangData.panchang.tithiSpecial,
  });

  await schedule.save();

  return {
    alreadyExists: false,
    scheduleId: schedule._id,
    date: schedule.date,
    tithi: schedule.tithi,
    specialTithi: schedule.specialTithi,
    email: finalEmail,
  };
};
const fetchTithi = async (userId, date, location, tz) => {
  if (!userId || !date) throw new Error("userId and date are required");

  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  const panchangData = await getPanchangData({ date, location, tz });
  if (!panchangData?.panchang?.tithi) {
    throw new Error("Failed to fetch Tithi from Panchang data");
  }

  return {
    tithi: panchangData.panchang.tithi,
    specialTithi: panchangData.panchang.tithiSpecial,
  };
};

module.exports = {
  getPanchangData,
  scheduleTithi,
  fetchTithi,
};
