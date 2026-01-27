const { BadRequestError } = require("../../errors");
const asyncHandler = require("../../middlewares/asyncHandler");
const laalKitaabService = require("../../services/kundli/laalKitaabService");

const getLaalKitaab = asyncHandler(async (req, res) => {
  try {
    const {
      day,
      month,
      year,
      hour,
      min,
      location,
      tzone=5.5,
      id
    } = req.query;

    const isRelative = Boolean(id);
    const userId = id || req.user?._id || null;
    const useQueryParams =
      Boolean(day && month && year && hour && min && location && tzone);

    if (!userId && !useQueryParams) {
      throw new BadRequestError(
        "Provide full birth details or userId/token."
      );
    }

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
      useQueryParams,
    });

    res.status(200).json(laalKitaabData);
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = {
  getLaalKitaab,
};
