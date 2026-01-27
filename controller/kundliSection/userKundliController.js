const { BadRequestError } = require("../../errors");
const asyncHandler = require("../../middlewares/asyncHandler");
const userKundliService = require("../../services/kundli/userKundliService");
const { default: API } = require("../../services/kundli/api");
const { default: axios } = require("axios");
const getMatchMaking = asyncHandler(async (req, res) => {
  const userId = req.user?._id || null; // FIXED (safe access)
  const { partnerId, ...directParams } = req.query;

  let matchData;

  //  Token user + partnerId → User DB-based matchmaking
  if (userId && partnerId) {
    matchData = await userKundliService.getMatchMakingData(userId, partnerId);
  }

  //  Direct params matchmaking (no token needed)
  else if (Object.keys(directParams).length > 0) {
    const requiredParams = [
      "boy_dob",
      "boy_tob",
      "boy_tz",
      "boy_birthPlace",
      "girl_dob",
      "girl_tob",
      "girl_tz",
      "girl_birthPlace",
      "lang",
    ];

    const missingParams = requiredParams.filter((p) => !(p in directParams));
    if (missingParams.length > 0) {
      throw new BadRequestError(
        `Missing required parameters: ${missingParams.join(", ")}`,
      );
    }

    // Call 3rd-party matchmaking API
    const response = await axios.get(API.MATCH_MAKING(directParams));
    matchData = response.data;
  }

  //  Neither token nor params provided
  else {
    throw new BadRequestError(
      "Either provide logged-in user & partnerId OR all direct parameters",
    );
  }

  res.status(200).json(matchData);
});

module.exports = {
  getMatchMaking,
};
