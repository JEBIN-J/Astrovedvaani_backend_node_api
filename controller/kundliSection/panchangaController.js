const { BadRequestError } = require("../../errors");
const asyncHandler = require("../../middlewares/asyncHandler");
const panchangService = require("../../services/kundli/panchangService");

const getPanchang = asyncHandler(async (req, res) => {
  const idParam = req.query.id?.trim();
  const isRelative = Boolean(idParam);

  const userId = isRelative ? idParam : req.user?._id;

  const { date, location, tz } = req.query;
  const requestStartTime = Date.now();

  if (!date) throw new BadRequestError("date is required");
  if (!location) throw new BadRequestError("location is required");
  if (tz === undefined) throw new BadRequestError("tz is required");

  const panchangData = await panchangService.getPanchangData({
    userId, //  id-based userId
    date,
    location,
    tz,
  });

  res.status(200).json(panchangData);
});

const scheduleTithi = async (req, res) => {
  try {
    const { date, email, location } = req.body; // ✅ email optional
    const userId = req.user?._id;
    const tz = 5.5;
    const data = await panchangService.scheduleTithi(
      userId,
      date,
      email,
      location,
      tz,
    );

    if (data.alreadyExists) {
      return res.json({
        success: false,
        message: data.message,
      });
    }

    res.json({
      success: true,
      message: "Tithi scheduled successfully",
      data,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
const fetchTithi = async (req, res) => {
  try {
    const { date, location } = req.query; // ✅ email optional
    const userId = req.user?._id;
    const tz = 5.5;
    const data = await panchangService.fetchTithi(userId, date, location, tz);

    res.json({
      success: true,
      message: "Tithi fetched successfully",
      data,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getPanchang,
  scheduleTithi,
  fetchTithi,
};
