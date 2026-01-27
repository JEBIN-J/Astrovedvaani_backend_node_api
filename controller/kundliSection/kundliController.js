const { BadRequestError } = require("../../errors");
const asyncHandler = require("../../middlewares/asyncHandler");
const kundliService = require("../../services/kundli/kundliService");
const { getPanchangData } = require("../../services/kundli/panchangService");
const logger = require("../../utils/logger");
const getKundli = asyncHandler(async (req, res) => {
  const { day, month, year, hour, min, tz, lang, name, birthPlace, id } =
    req.query;

  const isRelative = id != null;
  const userId = id || req.user?._id;
  if (!userId) throw new BadRequestError("User ID is missing");

  const kundliData = await kundliService.getKundliData(
    userId,
    { day, month, year, hour, min, tz, lang, name, birthPlace },
    isRelative,
  );

  res.status(200).json(kundliData);
});

const getKundliDetails = asyncHandler(async (req, res) => {
  const { day, month, year, hour, min, tz, lang, name, birthPlace, id } =
    req.query;

  const isRelative = id != null;
  const userId = id || req.user?._id;
  if (!userId) throw new BadRequestError("User ID is missing");

  const queryParams = {
    day,
    month,
    year,
    hour,
    min,
    tz,
    lang,
    name,
    birthPlace,
  };

  const kundliDetailsData = await kundliService.getKundliDetailsData(
    userId,
    queryParams,
    isRelative,
  );

  res.status(200).json(kundliDetailsData);
});

const getKPDetails = asyncHandler(async (req, res) => {
  const { dob, tob, tz, birthPlace, id } = req.query;

  const isRelative = id != null;
  const userId = id || req.user?._id;
  if (!userId) throw new BadRequestError("User ID is missing");

  const kundliDetailsData = await kundliService.getKPDetails(
    userId,
    {
      dob,
      tob,
      tz,
      birthPlace,
    },
    isRelative,
  );

  res.status(200).json(kundliDetailsData);
});

const getAshtakvargaCharts = asyncHandler(async (req, res) => {
  const { dob, tob, tz, birthPlace, style = "north", id } = req.query;
  const isRelative = id != null;
  const userId = id || req.user?._id;
  if (!userId) throw new BadRequestError("User ID is missing");
  const kundliDetailsData = await kundliService.getAshtakvargaCharts(
    userId,
    style,
    dob,
    tob,
    tz,
    birthPlace,
    false,
    isRelative,
  );
  res.status(200).json(kundliDetailsData);
});

const getCharts = asyncHandler(async (req, res) => {
  const isRelative = req.query.id != null;
  const userId = req.query.id || req.user?._id;
  if (!userId) throw new BadRequestError("User ID is missing");
  const div = req.query.div || "D1";
  const style = req.query.style || "north";
  const lang = req.query.lang || "en";
  const dob = req.query.dob;
  const tob = req.query.tob;
  const tz = req.query.tz;
  const birthPlace = req.query.birthPlace;
  const chartData = await kundliService.getCharts(
    userId,
    div,
    style,
    lang,
    dob,
    tob,
    tz,
    birthPlace,
    false,
    isRelative,
  );
  res.status(200).json(chartData);
});

const getDasha = asyncHandler(async (req, res) => {
  const idParam = req.query.id?.trim();
  const isQuery = Boolean(idParam);

  const userId = isQuery ? idParam : req.user?._id;

  const { day, month, year, hour, min, tz, lang, name, location } = req.query;

  const useQueryParams = Boolean(
    day && month && year && hour && min && location,
  );

  if (!userId && !useQueryParams) {
    throw new BadRequestError("Either User ID or birth details are required");
  }

  const dashaData = await kundliService.getDasha(
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
    isQuery, // 🔥 ONLY ADDITION
  );

  res.status(200).json(dashaData);
});

const getAscendantReport = asyncHandler(async (req, res) => {
  // 🔥 id based support
  const idParam = req.query.id?.trim();
  const isQuery = Boolean(idParam);

  const userId = isQuery ? idParam : req.user?._id;
  if (!userId) throw new BadRequestError("User ID is missing");

  const lang = req.query.lang || "en";
  const dob = req.query.dob;
  const tob = req.query.tob;
  const tz = req.query.tz;
  const birthPlace = req.query.birthPlace;

  logger.info(`[Ascendant Controller] userId=${userId}, isQuery=${isQuery}`);

  const reportData = await kundliService.getAscendantReport(
    userId,
    lang,
    dob,
    tob,
    tz,
    birthPlace,
    isQuery, // 🔑 id based flag
  );

  res.status(200).json(reportData);
});

const getMonthlyChoghadiya = asyncHandler(async (req, res) => {
  const id = req.query.id;
  const userId = id || req.user?._id;
  const isQuery = Boolean(id);
  if (!userId) throw new BadRequestError("User ID is missing");
  const { location, month } = req.query;
  if (!location || !month)
    throw new BadRequestError("Location and month are required");
  const data = await kundliService.getMonthlyChoghadiya(
    userId,
    location,
    month,
    isQuery,
  );
  res.status(200).json(data);
});
// const getFullNumerology = asyncHandler(async (req, res) => {
//   const id = req.query.id;
//   const userId = id || req.user?._id;
//   const isQuery = Boolean(id);
//   if (!userId) throw new BadRequestError("User ID is missing");
//   // const { name } = req.query;
//   // if (!name) throw new BadRequestError("Name is required for Numerology");
//   const data = await kundliService.getFullNumerology(userId, isQuery);
//   res.status(200).json(data);
// });

const getFullNumerology = asyncHandler(async (req, res) => {
  const id = req.query.id;
  const userId = id || req.user?._id;
  const isQuery = Boolean(id);

  if (!userId) throw new BadRequestError("User ID is missing");

  // Extract relevant query params (if user provided any)
  const { name, dob, tob, tz, birthplace } = req.query;

  const data = await kundliService.getFullNumerology(userId, isQuery, {
    name,
    dob,
    tob,
    tz,
    birthplace,
  });

  res.status(200).json(data);
});

const getChoghadiya = asyncHandler(async (req, res) => {
  const id = req.query.id;
  const userId = id || req.user?._id;
  const isQuery = Boolean(id);
  if (!userId) throw new BadRequestError("User ID is missing");
  const { location, date } = req.query;
  if (!location || !date)
    throw new BadRequestError("Location and date are required");
  const data = await kundliService.getChoghadiya(
    userId,
    location,
    date,
    isQuery,
  );
  res.status(200).json(data);
});

const getFullKundliData = asyncHandler(async (req, res) => {
  const idParam = req.query.id?.trim();
  const isRelative = Boolean(idParam);

  const userId = isRelative ? idParam : req.user?._id;
  if (!userId) throw new BadRequestError("User ID is missing");

  let { day, month, year, hour, min, tz, lang, name, birthPlace, div, style } =
    req.query;

  // Normalize query params (AS-IS)
  day = day ? String(day).padStart(2, "0") : undefined;
  month = month ? String(month).padStart(2, "0") : undefined;
  hour = hour ? String(hour).padStart(2, "0") : undefined;
  min = min ? String(min).padStart(2, "0") : undefined;
  tz = tz ? Number(tz) : 5.5;
  year = year ? Number(year) : undefined;

  logger.info(
    `[Debug] getFullKundliData called: userId=${userId}, isRelative=${isRelative}`,
  );

  const kundliData = await kundliService.getFullKundliData(
    userId,
    {
      day,
      month,
      year,
      hour,
      min,
      tz,
      lang,
      name,
      birthPlace,
      div,
      style,
    },
    isRelative, // 🔥 ONLY CHANGE
  );

  res.status(200).json(kundliData);
});

const searchCoordinates = async (req, res) => {
  try {
    const { lat, lon } = req.query;
    if (!lat || !lon) {
      throw new BadRequestError("Latitude and Longitude are required");
    }
    const data = await kundliService.getLocationByCoordinates(lat, lon);
    res.json({ success: true, data });
    (async () => {
      try {
        const today = new Date();
        const tz = data?.timezone || "Asia/Kolkata";
        const location = data?.city || `${lat},${lon}`;
        await getPanchangData({
          date: today,
          location,
          tz,
        });
        console.log(`Panchang data prefetched for ${location}`);
      } catch (err) {
        console.error("Failed to prefetch Panchang data:", err);
      }
    })();
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getKundli,
  getKundliDetails,
  getKPDetails,
  searchCoordinates,
  getAshtakvargaCharts,
  getCharts,
  getDasha,
  getAscendantReport,
  getMonthlyChoghadiya,
  getFullNumerology,
  getChoghadiya,
  getFullKundliData,
};
