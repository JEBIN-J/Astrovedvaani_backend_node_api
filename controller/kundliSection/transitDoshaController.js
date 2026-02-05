const { BadRequestError } = require("../../errors");
const asyncHandler = require("../../middlewares/asyncHandler");
const transitDoshaService = require("../../services/kundli/transitDoshaService")

const getDosha = asyncHandler(async (req, res) => {
  const id = req.query.id || null;
  const userId = req.user?._id || null;
  const isQuery = ["dob", "tob", "birthPlace", "tz"].some((k) =>
    Object.prototype.hasOwnProperty.call(req.query, k)
  );
  if (!isQuery && !id && !userId) {
    throw new BadRequestError("Logged-in user or id or query params are required");
  }
  const data = await transitDoshaService.getDosha(userId, id, req.query, isQuery);
  res.status(200).json(data);
});
const getTransitPlanets = asyncHandler(async (req, res) => {
  const id = req.query.id || null;
  const userId = req.user?._id || null;
  const isQuery = ["dob", "tob", "birthPlace", "tz", "transit_date", "transit_time", "transitPlace", "transit_tz"].some(
    (k) => Object.prototype.hasOwnProperty.call(req.query, k)
  );
  if (!isQuery && !id && !userId) {
    throw new BadRequestError("Logged-in user, id, or query params are required");
  }
  const data = await transitDoshaService.getTransitPlanets(userId, id, req.query, isQuery);
  res.status(200).json(data);
});


module.exports = {
  getDosha,
  getTransitPlanets
};

