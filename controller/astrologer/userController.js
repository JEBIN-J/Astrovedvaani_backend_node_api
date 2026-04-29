const userService = require("../../services/astrologer/userService");
const kundliService = require("../../services/kundli/kundliService");
const UserAstrology = require("../../models/UserAstrology");
const User = require("../../models/User");
const FollowRequest = require("../../models/FollowRequest");
const logger = require("../../utils/logger");
const asyncHandler = require("../../middlewares/asyncHandler");
const {
  getLaalKitaabData,
} = require("../../services/kundli/laalKitaabService");
exports.getUserById = async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const user = await userService.fetchUserDetailsById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    logger.error("Error fetching user by ID:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
exports.getAstrologerFeedback = asyncHandler(async (req, res) => {
  const astrologerUserId = req.user._id;

  const {
    page = 1,
    limit = 10,
    source_type,
    rating,
    is_visible,
    sort_by,
    duration,
    from_date, // e.g., "2025-01-01"
    to_date, // e.g., "2025-01-31"
  } = req.query;

  const result = await userService.getFeedbackForAstrologer(
    astrologerUserId,
    parseInt(page, 10),
    parseInt(limit, 10),
    { source_type, rating, is_visible, sort_by, duration, from_date, to_date },
  );

  return res.status(200).json({
    success: true,
    message: "Feedback fetched successfully",
    ...result,
  });
});

const formatDateDDMMYYYY = (date) => {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

exports.getUserProfileById = async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    logger.info(`Astrologer fetching user profile for userId: ${userId}`);

    const user = await User.findById(userId).lean();
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const followersCount = await FollowRequest.countDocuments({
      astrologer_id: userId,
    });
    const followingCount = await FollowRequest.countDocuments({
      user_id: userId,
    });

    const astrology = await UserAstrology.findOne({
      userId,
      relationshipToOwner: "self",
    }).lean();
    const getGenderString = (genderValue) => {
      if (genderValue === 1) return "Male";
      if (genderValue === 2) return "Female";
      if (genderValue === 3) return "Other";
      return null;
    };
    const getRelationshipStatusString = (statusValue) => {
      if (statusValue === 10) return "In Relationship";
      if (statusValue === 20) return "Single";
      if (statusValue === 30) return "Married";
      if (statusValue === 40) return "Widowed";
      return null;
    };

    const profile = {
      _id: user._id,
      name: user.name || (astrology ? astrology.name : null),
      email: user.email || null,
      gender: getGenderString(
        user.gender || (astrology ? astrology.gender : null),
      ),
      mobileNumber: user.mobileNumber || null,
      relationship_status: getRelationshipStatusString(
        user.relationship_status || null,
      ),
      birthDate: formatDateDDMMYYYY(
        user.birthDate || (astrology ? astrology.birthDate : null),
      ),
      birthTime: user.birthTime || (astrology ? astrology.birthTime : null),
      birthPlace: user.birthPlace || (astrology ? astrology.birthPlace : null),
      profilePicture: user.profilePicture || null,

      latitude: astrology ? astrology.latitude : null,
      longitude: astrology ? astrology.longitude : null,
      timezone: astrology ? astrology.timezone : 5.5,
      sunSign: astrology ? astrology.sunSign : null,
      ascendant: astrology ? astrology.ascendant : null,
      rasi: astrology ? astrology.rasi : null,
      rasiLord: astrology ? astrology.rasiLord : null,
      nakshatra: astrology ? astrology.nakshatra : null,
      nakshatraLord: astrology ? astrology.nakshatraLord : null,
      nakshatraPada: astrology ? astrology.nakshatraPada : null,
      manglikStatus: astrology ? astrology.manglikStatus : null,
      doshas: astrology ? astrology.doshas : [],
      gotra: astrology ? astrology.gotra : null,
      nadi: astrology ? astrology.nadi : null,
      varna: astrology ? astrology.varna : null,
      paya: astrology ? astrology.paya : null,
      tatva: astrology ? astrology.tatva : null,
      lifeStone: astrology ? astrology.lifeStone : null,
      luckyStone: astrology ? astrology.luckyStone : null,
      fortuneStone: astrology ? astrology.fortuneStone : null,
      nameStart: astrology ? astrology.nameStart : null,
      preferredAstrologySystem: astrology
        ? astrology.preferredAstrologySystem
        : "vedic",
      preferredLanguage: astrology ? astrology.preferredLanguage : "en",
      relationshipToOwner: astrology ? astrology.relationshipToOwner : "self",
    };

    return res.status(200).json({
      success: true,
      message: "User profile fetched successfully",
      user: profile,
    });
  } catch (error) {
    logger.error("Error fetching user profile by astrologer:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

exports.getCompleteKundliByUserId = asyncHandler(async (req, res) => {
  logger.info("[getCompleteKundliByUserId] Controller STARTED");

  const { id } = req.query;
  const targetUserId = id || req.user?._id;
  if (!targetUserId) {
    logger.error(
      "[getCompleteKundliByUserId] Missing userId - throwing BadRequest",
    );
    throw new BadRequestError("User ID is missing");
  }

  const isRelative = false;
  const isQuery = false;

  logger.info(
    `[getCompleteKundliByUserId] Fetching complete kundli for userId=${targetUserId} (self-profile)`,
  );

  try {
    logger.info("[getCompleteKundliByUserId] Starting profile query...");
    const profile = await UserAstrology.findOne({
      userId: targetUserId,
      relationshipToOwner: "self",
    });
    logger.info(
      `[getCompleteKundliByUserId] Profile query done: ${
        profile ? "FOUND" : "NULL"
      }`,
    );

    if (!profile) {
      logger.warn(
        `[getCompleteKundliByUserId] No self-profile found for userId=${targetUserId}. Consider creating one or handling gracefully.`,
      );
      return res.status(404).json({
        success: false,
        message: "User's astrology profile not found. Kundli data unavailable.",
      });
    }

    logger.info(
      "[getCompleteKundliByUserId] Profile found, starting Promise.allSettled...",
    );

    // Use allSettled: Continues even if one fails
    const results = await Promise.allSettled([
      kundliService.getKundliData(targetUserId, {}, isRelative),
      kundliService.getKundliDetailsData(targetUserId, {}, isRelative),
      kundliService.getKPDetails(targetUserId, {}, isRelative),
      kundliService.getAshtakvargaChartDetails(
        targetUserId,
        "north",
        null,
        null,
        null,
        null,
        isQuery,
        isRelative,
      ),
      kundliService.getChartDetails(
        targetUserId,
        // "D1",
        // "north",
        // "en",
        // undefined,
        // undefined,
        // undefined,
        // undefined,
        {},
        isRelative,
      ),
      kundliService.getDasha(targetUserId, {}, isRelative),
      // getLaalKitaabData({
      //   userId: targetUserId,
      //   isRelative,
      //   useQueryParams: isQuery,
      // }),
    ]);

    logger.info("[getCompleteKundliByUserId] Promise.allSettled completed");

    // Extract results
    const [
      basicKundliRes,
      detailedKundliRes,
      kpDetailsRes,
      ashtakvargaRes,
      chartsRes,
      dashaRes,
      laalKitaabRes,
    ] = results;

    // Log failures
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        const serviceNames = [
          "basicKundli",
          "detailedKundli",
          "kpDetails",
          "ashtakvarga",
          "charts",
          "dasha",
          "laalKitaab",
        ];
        logger.warn(
          `[getCompleteKundliByUserId] ${serviceNames[index]} failed: ${
            result.reason?.message || "Unknown error"
          }`,
        );
      }
    });

    const response = {
      success: true,
      message:
        "Complete Kundli data fetched successfully (partial if some services unavailable)",
      data: {
        basicKundli:
          basicKundliRes.status === "fulfilled" ? basicKundliRes.value : null,
        detailedKundli:
          detailedKundliRes.status === "fulfilled"
            ? detailedKundliRes.value
            : null,
        kpDetails:
          kpDetailsRes.status === "fulfilled" ? kpDetailsRes.value : null,
        ashtakvarga:
          ashtakvargaRes.status === "fulfilled" ? ashtakvargaRes.value : null,
        charts: chartsRes.status === "fulfilled" ? chartsRes.value : null,
        dasha: dashaRes.status === "fulfilled" ? dashaRes.value : null,
        // laalKitaab:
        //   laalKitaabRes.status === "fulfilled" ? laalKitaabRes.value : null,
      },
      // warnings: results.some(r => r.status === 'rejected')
      //   ? ['Some services (e.g., charts) may be temporarily unavailable due to API issues.']
      //   : [],
    };

    logger.info("[getCompleteKundliByUserId] Sending response");
    res.status(200).json(response);
  } catch (error) {
    logger.error(
      `[getCompleteKundliByUserId] Unexpected error for userId=${targetUserId}:`,
      error,
    );
    logger.error("[getCompleteKundliByUserId] Full error stack:", error.stack);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch complete Kundli details",
    });
  }
});
