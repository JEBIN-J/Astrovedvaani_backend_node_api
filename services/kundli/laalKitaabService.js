const axios = require("axios");
const logger = require("../../utils/logger");
const CacheService = require("../../utils/redis/cacheService");
const API = require("./api").default;
const UserAstrology = require("../../models/UserAstrology");
const { convertTo24Hour } = require("../../utils/timeUtils");

const getLaalKitaabData = async ({
  userId,
  day,
  month,
  year,
  hour,
  min,
  location,
  tzone,
  isRelative = false,
  useQueryParams = false
}) => {
  logger.info("===== getLaalKitaabData called =====");
  logger.info(
    `Input params: ${JSON.stringify({
      userId,
      day,
      month,
      year,
      hour,
      min,
      location,
      tzone,
      isRelative,
      useQueryParams,
    })}`
  );

  /**************************************
   * 1️⃣ QUERY PARAM (Guest override)
   **************************************/
  if (useQueryParams) {
    const cacheKey = CacheService.generateKey(
      CacheService.CACHE_PREFIXES.USER_DETAILS,
      `laalkitab-guest`,
      `${day}-${month}-${year}-${hour}-${min}-${location}-${tzone}`
    );

    const cached = await CacheService.get(cacheKey);
    if (cached) return cached;

    const apiUrl = API.LAAL_KITAAB({
      day,
      month,
      year,
      hour,
      min,
      location,
      tzone,
    });

    logger.info(`[Guest] Fetching Laal Kitaab: ${apiUrl}`);
    const response = await axios.get(apiUrl);

    await CacheService.set(cacheKey, response.data, 2 * 60 * 60);
    return response.data;
  }

  /**************************************
   * 2️⃣ USER/RELATIVE MODE
   **************************************/
  let profile = null;

  if (userId) {
    profile = isRelative
      ? await UserAstrology.findById(userId)
      : await UserAstrology.findOne({
          userId,
          relationshipToOwner: "self",
        });

    if (!profile) throw new Error("Astrology profile not found");
  }

  // Build from profile
  const dob = new Date(profile.birthDate);

  const finalDay = day || String(dob.getDate()).padStart(2, "0");
  const finalMonth = month || String(dob.getMonth() + 1).padStart(2, "0");
  const finalYear = year || dob.getFullYear();
  const finalLoc = location || profile.birthPlace.trim();
  const finalTz =
    tzone || profile.timezone || -dob.getTimezoneOffset() / 60;

  let finalHour = hour;
  let finalMin = min;

  if ((!hour || !min) && profile.birthTime) {
    const [h, m] = convertTo24Hour(profile.birthTime).split(":");
    finalHour = finalHour ?? parseInt(h, 10);
    finalMin = finalMin ?? parseInt(m, 10);
  }

  if (
    !finalDay ||
    !finalMonth ||
    !finalYear ||
    finalHour === undefined ||
    finalMin === undefined ||
    !finalLoc ||
    finalTz === undefined
  ) {
    throw new Error("Missing birth details for Laal Kitaab");
  }

  /**************************************
   * 3️⃣ CACHE (user or relative)
   **************************************/
  const cacheKey = CacheService.generateKey(
    CacheService.CACHE_PREFIXES.USER_DETAILS,
    `laalkitab`,
    `${finalDay}-${finalMonth}-${finalYear}-${finalHour}-${finalMin}-${finalLoc}-${finalTz}`,
    userId
  );

  const cached = await CacheService.get(cacheKey);
  if (cached) {
    // Background refresh
    (async () => {
      try {
        const apiUrl = API.LAAL_KITAAB({
          day: finalDay,
          month: finalMonth,
          year: finalYear,
          hour: finalHour,
          min: finalMin,
          location: finalLoc,
          tzone: finalTz,
        });
        const resp = await axios.get(apiUrl);
        await CacheService.set(cacheKey, resp.data, 2 * 60 * 60);
      } catch (err) {
        logger.error("Background refresh error:", err.message);
      }
    })();
    return cached;
  }

  /**************************************
   * 4️⃣ CALL REAL API
   **************************************/
  const apiUrl = API.LAAL_KITAAB({
    day: finalDay,
    month: finalMonth,
    year: finalYear,
    hour: finalHour,
    min: finalMin,
    location: finalLoc,
    tzone: finalTz,
  });

  logger.info(`[User/Relative] Fetching LaalKitaab API: ${apiUrl}`);

  const response = await axios.get(apiUrl);
  await CacheService.set(cacheKey, response.data, 2 * 60 * 60);

  return response.data;
};


module.exports = {
  getLaalKitaabData,
};
