const { BadRequestError } = require("../../errors");
const asyncHandler = require("../../middlewares/asyncHandler");
const UserAstrology = require("../../models/UserAstrology");
const kundliService = require("../../services/kundli/kundliService");
const { getPanchangData } = require("../../services/kundli/panchangService");
const logger = require("../../utils/logger");

const getKundli = asyncHandler(async (req, res) => {
  const { day, month, year, hour, min, tz, lang, name, birthPlace } = req.query;
  const userId = req.user?._id;
  if (!userId) throw new BadRequestError("User ID is missing");

  const kundliData = await kundliService.getKundliData(userId, {
    day,
    month,
    year,
    hour,
    min,
    tz,
    lang,
    name,
    birthPlace,
  });

  res.status(200).json(kundliData);
});

const getKundliDetails = asyncHandler(async (req, res) => {
  const { day, month, year, hour, min, tz, lang, name, birthPlace } = req.query;

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
    req.user?._id,
    false,
    queryParams,
  );

  res.status(200).json(kundliDetailsData);
});

const getKPDetails = asyncHandler(async (req, res) => {
  const { dob, tob, tz, birthPlace } = req.query;

  const userId = req.user?._id;
  if (!userId) throw new BadRequestError("User ID is missing");

  const kundliDetailsData = await kundliService.getKPDetails(userId, {
    dob,
    tob,
    tz,
    birthPlace,
  });

  res.status(200).json(kundliDetailsData);
});

const getAshtakvargaCharts = asyncHandler(async (req, res) => {
  const { dob, tob, tz, birthPlace, style = "north" } = req.query;
  const userId = req.user?._id;

  if (!userId) throw new BadRequestError("User ID is missing");
  const kundliDetailsData = await kundliService.getAshtakvargaCharts(
    userId,
    style,
    dob,
    tob,
    tz,
    birthPlace,
    false,
  );
  res.status(200).json(kundliDetailsData);
});

const getCharts = asyncHandler(async (req, res) => {
  const userId = req.user?._id;

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
  );
  res.status(200).json(chartData);
});

const getDasha = asyncHandler(async (req, res) => {
  const { day, month, year, hour, min, tz, lang, name, location } = req.query;
  const userId = req.user?._id;
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
  );

  res.status(200).json(dashaData);
});

const getAscendantReport = asyncHandler(async (req, res) => {
 
  const idParam = req.query.id?.trim();
  const isQuery = Boolean(idParam);

  const userId = isQuery ? idParam : req.user?._id || null;
  // if (!userId) throw new BadRequestError("User ID is missing");

  const lang = req.query.lang || "en";
  const dob = req.query.dob;
  const tob = req.query.tob;
  const tz = req.query.tz;
  const name = req.query.name;
  const birthPlace = req.query.birthPlace;

  logger.info(`[Ascendant Controller] userId=${userId}, isQuery=${isQuery}`);

  const reportData = await kundliService.getAscendantReport(
    userId,
    lang,
    dob,
    tob,
    tz,
    birthPlace,
    isQuery, 
    name,
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

const getFullNumerology = asyncHandler(async (req, res) => {
  const id = req.query.id;
  const userId = id || req.user?._id;
  const isQuery = Boolean(id);

  // if (!userId) throw new BadRequestError("User ID is missing");

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
  const userId = req.query.id || req.user?._id;
  // if (!userId) throw new BadRequestError("User ID is missing");

  let { day, month, year, hour, min, tz, lang, name, birthPlace, div, style } =
    req.query;

  // Normalize query params
  day = day ? String(day).padStart(2, "0") : undefined;
  month = month ? String(month).padStart(2, "0") : undefined;
  hour = hour ? String(hour).padStart(2, "0") : undefined;
  min = min ? String(min).padStart(2, "0") : undefined;
  tz = tz ? Number(tz) : 5.5; // default to 5.5
  year = year ? Number(year) : undefined;

  const isQuery = Object.keys(req.query).length > 0;

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
    isQuery,
  );

  res.status(200).json(kundliData);
});

const searchLocation = async (req, res) => {
  try {
    const { query } = req.query; //city/state/place
    if (!query) {
      return res
        .status(400)
        .json({ success: false, message: "Query parameter is required" });
    }

    const data = await getCoordinatesByLocation(query);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const searchCoordinates = async (req, res) => {
  try {
    const { lat, lon } = req.query;
    if (!lat || !lon) {
      return res.status(400).json({
        success: false,
        message: "lat and lon parameters are required",
      });
    }

    const data = await kundliService.getLocationByCoordinates(lat, lon);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getSuggestions = async (req, res) => {
  try {
    const { input } = req.query;
    if (!input) {
      return res
        .status(400)
        .json({ success: false, message: "Input parameter is required" });
    }

    const data = await getLocationSuggestions(input);
    res.json({ success: true, data });
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
  getSuggestions,
  searchCoordinates,
  searchLocation,
};
