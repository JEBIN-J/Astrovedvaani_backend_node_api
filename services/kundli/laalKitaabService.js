const axios = require("axios");
const logger = require("../../utils/logger");
const CacheService = require("../../utils/redis/cacheService");
const API = require("./api").default;
const UserAstrology = require("../../models/UserAstrology");
const { getSaasHeaders } = require("../../utils/apiHeader");

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
}) => {
  logger.info("===== getLaalKitaabData called =====");
  logger.info(
    `Input params: userId=${userId}, day=${
      day
    }, month=${month}, year=${year}, hour=${hour}, min=${min}, location=${location}, tzone=${tzone}, isRelative=${isRelative}`,
  );

  let profile;

  if (userId) {
    profile = isRelative
      ? await UserAstrology.findById(userId)
      : await UserAstrology.findOne({ userId, relationshipToOwner: "self" });

    if (!profile) throw new Error("Astrology profile not found");
  }

  const dob = profile?.birthDate ? new Date(profile.birthDate) : null;
  day = day ?? (dob ? String(dob.getDate()).padStart(2, "0") : undefined);
  month =
    month ?? (dob ? String(dob.getMonth() + 1).padStart(2, "0") : undefined);
  year = year ?? (dob ? String(dob.getFullYear()) : undefined);
  location = location ?? profile?.birthPlace?.trim();
  tzone = tzone ?? profile?.timezone ?? 5.5;

  if ((hour === undefined || min === undefined) && profile?.birthTime) {
    const timeStr = profile.birthTime.trim();
    let match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (match) {
      let h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      const ampm = match[3].toUpperCase();
      if (ampm === "PM" && h < 12) h += 12;
      if (ampm === "AM" && h === 12) h = 0;
      hour = hour ?? h;
      min = min ?? m;
    } else {
      match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
      if (match) {
        hour = hour ?? parseInt(match[1], 10);
        min = min ?? parseInt(match[2], 10);
      }
    }
  }

  // Validate required params
  if (
    !day ||
    !month ||
    !year ||
    hour === undefined ||
    min === undefined ||
    !location ||
    tzone === undefined
  ) {
    throw new Error(
      "Missing parameters (day/month/year/hour/min/location/tzone)",
    );
  }

  // Cache key
  const cacheKey = CacheService.generateKey(
    CacheService.CACHE_PREFIXES.USER_DETAILS,
    `laalkitab-${location}-${day}-${month}-${year}-${hour}-${min}-${isRelative ? "relative" : "user"}`,
    userId || "guest",
  );

  const cachedData = await CacheService.get(cacheKey);

  const fetchAndCache = async () => {
    // Convert to external format
    const dob = `${day}-${month}-${year}`; // DD-MM-YYYY
    const tob = `${hour}:${min}`; // HH:mm

    const apiUrl = API.LAAL_KITAAB({
      name: profile?.name || "User",
      dob,
      tob,
      birthPlace: location,
      tz: tzone,
    });

    const response = await axios.get(apiUrl, {
      headers: getSaasHeaders(),
      timeout: 15000,
    });
    await CacheService.set(cacheKey, response.data, 2 * 60 * 60); // 2h cache
    return response.data;
  };

  if (cachedData) {
    fetchAndCache().catch((err) =>
      logger.error(`Background cache refresh failed: ${err.message}`),
    );
    return cachedData;
  }

  return await fetchAndCache();
};

module.exports = {
  getLaalKitaabData,
};
