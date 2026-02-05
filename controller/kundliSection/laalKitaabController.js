const { BadRequestError } = require("../../errors");
const asyncHandler = require("../../middlewares/asyncHandler");
const laalKitaabService = require("../../services/kundli/laalKitaabService");

const getLaalKitaab = asyncHandler(async (req, res) => {
  try {
    const relativeId = req.query.id;
    const isRelative = !!relativeId;
    const userId = relativeId || req.user?._id;

    const { day, month, year, hour, min, location, tzone } = req.query;

    const laalKitaabData = await laalKitaabService.getLaalKitaabData({
      userId,
      day,
      month,
      year,
      hour,
      min,
      location,
      tzone,
      isRelative,
    });

    res.status(200).json(laalKitaabData);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = {
  getLaalKitaab,
};
