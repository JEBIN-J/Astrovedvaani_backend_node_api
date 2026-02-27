const { BadRequestError } = require("../../errors");
const asyncHandler = require("../../middlewares/asyncHandler");
const UserAstrology = require("../../models/UserAstrology");
const kundliService = require("../../services/kundli/kundliService");
const { getPanchangData } = require("../../services/kundli/panchangService");
const logger = require("../../utils/logger");

const extractCommonParams = (req) => {
  const isRelative = Boolean(req.query?.id);
  const userId = req.query?.id || req.user?._id;

  if (!userId) {
    throw new BadRequestError("User ID is missing");
  }

  return {
    userId,
    isRelative,
    queryParams: { ...req.query },
  };
};

const getKundli = asyncHandler(async (req, res) => {
  const { userId, queryParams, isRelative } = extractCommonParams(req);

  const kundliData = await kundliService.getKundliData(
    userId,
    queryParams,
    isRelative,
  );

  res.status(200).json(kundliData);
});

const getKundliDetails = asyncHandler(async (req, res) => {
   const { userId, queryParams, isRelative } = extractCommonParams(req);

  const kundliDetailsData = await kundliService.getKundliDetailsData(
    userId,
    queryParams,
    isRelative,
  );

  res.status(200).json(kundliDetailsData);
});

const getKPDetails = asyncHandler(async (req, res) => {
  const { userId, queryParams, isRelative } = extractCommonParams(req);

  const kundliDetailsData = await kundliService.getKPDetails(
    userId,
    queryParams,
    isRelative,
  );

  res.status(200).json(kundliDetailsData);
});

const getAshtakvargaCharts = asyncHandler(async (req, res) => {
  const { userId, queryParams, isRelative } = extractCommonParams(req);

  console.log("Query Params in Controller:", queryParams);
  console.log("User ID in Controller:", userId);
  console.log("Is Relative in Controller:", isRelative);

  console.log("Extracted Params:", { userId, queryParams, isRelative });

  const kundliDetailsData = await kundliService.getAshtakvargaChartDetails(
    userId,
    queryParams,
    isRelative,
  );

  console.log("Ashtakvarga Chart Details Data:", kundliDetailsData);
  res.status(200).json(kundliDetailsData);
});

const getCharts = asyncHandler(async (req, res) => {
  const { userId, queryParams, isRelative } = extractCommonParams(req);

    console.log("Extracted Params:", { userId, queryParams, isRelative });


  const data = await kundliService.getChartDetails(
    userId,
    queryParams,
    isRelative,
  );

  res.status(200).json(data);
});

const getDasha = asyncHandler(async (req, res) => {
  const { userId, queryParams, isRelative } = extractCommonParams(req);

  const data = await kundliService.getDasha(
    userId,
    queryParams,
    isRelative,
  );

  res.status(200).json(data);
});

const getAscendantReport = asyncHandler(async (req, res) => {
 
  const { userId, queryParams, isRelative } = extractCommonParams(req);

  const reportData = await kundliService.getAscendantReport(
    userId,
    queryParams,
    isRelative,
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
  console.log("query",req.query);
  let { userId, queryParams, isRelative } = extractCommonParams(req);

  if(queryParams?.isAstroSide == 'true')
  {
    isRelative=false;
  }

  console.log("Extracted Params for Full Kundli Data:", {
    userId,
    queryParams,
    isRelative,
  });

  const kundliData = await kundliService.getFullKundliData(
    userId,
    queryParams,
    isRelative,
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
