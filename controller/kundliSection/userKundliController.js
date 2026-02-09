const { BadRequestError } = require("../../errors");
const asyncHandler = require("../../middlewares/asyncHandler");
const userKundliService = require("../../services/kundli/userKundliService");
const { default: API } = require("../../services/kundli/api");
const { default: axios } = require("axios");
const { getSaasHeaders } = require("../../utils/apiHeader");
const getMatchMaking = asyncHandler(async (req, res) => {
  const userId = req.user?._id || null;
  const { partnerId, ...directParams } = req.query;

  let matchData;

  if (userId && partnerId) {
    matchData = await userKundliService.getMatchMakingData(userId, partnerId);
  } else if (Object.keys(directParams).length > 0) {
    const formatDOB = (dob) => {
      if (!dob) return dob;

      const parts = dob.replace(/\//g, "-").split("-");

      if (parts.length !== 3) return dob;

      let [d, m, y] = parts;

      d = d.padStart(2, "0");
      m = m.padStart(2, "0");

      return `${d}-${m}-${y}`;
    };

    if (directParams.boy_dob) {
      directParams.boy_dob = formatDOB(directParams.boy_dob);
    }

    if (directParams.girl_dob) {
      directParams.girl_dob = formatDOB(directParams.girl_dob);
    }

    if (directParams.lang) {
      directParams.lang = directParams.lang.trim();
    } else {
      directParams.lang = "en";
    }

    if (!directParams.boy_name) {
      directParams.boy_name = "Boy";
    }

    if (!directParams.girl_name) {
      directParams.girl_name = "Girl";
    }

    const finalUrl = API.MATCH_MAKING(directParams);

    const response = await axios.get(finalUrl, {
      headers: {
        "x-api-key": process.env.SAAS_API_KEY,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    });

    matchData = response.data;
  } else {
    throw new BadRequestError(
      "Either provide logged-in user & partnerId OR all direct parameters",
    );
  }

  res.status(200).json(matchData);
});

module.exports = {
  getMatchMaking,
};
