const Astrologer = require("../../models/Astrologer");
const AstrologerRanking = require("../../models/AstrologerRanking");
const AstrologerServiceRates = require("../../models/AstrologerServiceRates");
const Feedback = require("../../models/Feedback");
const FollowRequest = require("../../models/FollowRequest");
const User = require("../../models/User");
const Enums = require("../../utils/constants");
const logger = require("../../utils/logger");
const CacheService = require("../../utils/redis/cacheService");
const {
  emitAstrologerAvailability,
} = require("../socket/handleAstrologerEvents");

const ASTROLOGER_CACHE_PREFIX = "astro:list"; // Use same prefix

async function createOrUpdateAstrologer(userId, profileData) {
  try {
    logger.info(` Astrologer self profile completion | userId=${userId}`);

    // Validate astrologer user
    const user = await User.findById(userId);
    if (!user || user.role !== Enums.USER.ROLE.ASTROLOGER) {
      throw new Error("Invalid astrologer user");
    }

    // Validate services if provided
    const validServiceTypes = Object.values(Enums.SERVICE.TYPE);
    if (
      Array.isArray(profileData.services) &&
      profileData.services.length > 0
    ) {
      for (const service of profileData.services) {
        if (!validServiceTypes.includes(service.service_type)) {
          throw new Error(
            `Invalid service_type: ${
              service.service_type
            }. Valid types are: ${validServiceTypes.join(", ")}`,
          );
        }
      }
    }

    // Update astrologer record
    const astrologer = await Astrologer.findOneAndUpdate(
      { user_id: userId },
      {
        $set: {
          ...profileData,
          updatedAt: new Date(),
          isChat:
            profileData.services?.some(
              (s) => s.service_type === Enums.SERVICE.TYPE.CHAT,
            ) || false,
          isVideo:
            profileData.services?.some(
              (s) => s.service_type === Enums.SERVICE.TYPE.VIDEO,
            ) || false,
          isCall:
            profileData.services?.some(
              (s) => s.service_type === Enums.SERVICE.TYPE.CALL,
            ) || false,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    logger.info(`Astrologer profile saved | astrologerId=${astrologer._id}`);

    // Handle astrologer services
    if (Array.isArray(profileData.services)) {
      if (profileData.services.length > 0) {
        const bulkOps = profileData.services.map((s) => ({
          updateOne: {
            filter: {
              astrologer_id: astrologer._id,
              service_type: s.service_type,
            },
            update: { $set: { ...s, updatedAt: new Date() } },
            upsert: true,
          },
        }));
        await AstrologerServiceRates.bulkWrite(bulkOps);
        logger.info(
          `Astrologer services updated | astrologerId=${astrologer._id}, servicesCount=${profileData.services.length}`,
        );
      } else {
        await AstrologerServiceRates.deleteMany({
          astrologer_id: astrologer._id,
        });
        logger.info(
          `Deleted all services for astrologer | astrologerId=${astrologer._id}`,
        );
      }
    }

    if (profileData.profilePicture) {
      await User.findByIdAndUpdate(userId, {
        $set: { profilePicture: profileData.profilePicture },
      });
      logger.info(`User profile picture synced | userId=${userId}`);
    }
    if (profileData.gender) {
      await User.findByIdAndUpdate(userId, {
        $set: { gender: profileData.gender },
      });
      logger.info(`User gender synced | userId=${userId}`);
    }

    // Update user onboarding status
    await User.findByIdAndUpdate(userId, { $set: { isOnboarded: true } });
    logger.info(` User onboarding status updated | userId=${userId}`);

    // Clear caches
    await CacheService.clearUserRelatedCaches(userId);
    await CacheService.clearMatchingKeys(ASTROLOGER_CACHE_PREFIX);
    logger.info(` Cache cleared | userId=${userId}`);

    return astrologer;
  } catch (error) {
    logger.error(
      ` Service Error: Failed to create or update astrologer profile | userId=${userId}, error=${error.message}`,
    );
    throw error;
  }
}

async function fetchAstrologerFromUser(userId) {
  try {
    const astrologer = await Astrologer.findOne({ user_id: userId });
    if (!astrologer) {
      return res.status(404).json({
        success: false,
        message: "Astrologer profile not found",
      });
    }

    return astrologer;
  } catch (error) {
    logger.error(
      "Service Error: Failed to create or update astrologer profile",
      error,
    );
    throw error;
  }
}

async function createOrUpdateRate(astrologerId, data) {
  try {
    const { service_type, rate, commission_pct } = data;

    const updatedRate = await AstrologerServiceRates.findOneAndUpdate(
      { astrologer_id: astrologerId, service_type },
      { $set: { rate, commission_pct } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    await CacheService.clearMatchingKeys(ASTROLOGER_CACHE_PREFIX);

    return updatedRate;
  } catch (error) {
    logger.error(
      "Service Error: Failed to create or update service rate",
      error,
    );
    throw error;
  }
}

// async function fetchCompleteUserProfile(userId) {
//   try {
//     const user = await User.findById(userId).lean();
//     if (!user) throw new Error("User not found");
//     const astrologer = await Astrologer.findOne({ user_id: userId }).lean();
//     let rates = [];
//     if (astrologer) {
//       rates = await AstrologerServiceRates.find({
//         astrologer_id: astrologer._id,
//       }).lean();
//     }
//     const followersCount = astrologer
//       ? await FollowRequest.countDocuments({ astrologer_id: astrologer._id })
//       : 0;
//     const followingCount = await FollowRequest.countDocuments({
//       user_id: userId,
//     });
//     return {
//       user,
//       astrologer,
//       rates,
//       role: user.role,
//       followersCount,
//       followingCount,
//     };
//   } catch (error) {
//     logger.error("Service Error: Failed to fetch complete user profile", error);
//     throw error;
//   }
// }
async function fetchCompleteUserProfile(userId) {
  try {
    const user = await User.findById(userId).lean();
    if (!user) throw new Error("User not found");

    // ✅ Populate names instead of IDs
    let astrologer = await Astrologer.findOne({ user_id: userId })
      .populate("specializations", "name")
      .populate("languages_spoken", "name")
      .lean();

    let rates = [];
    let followersCount = 0;
    let ratingsAvg = 0;

    if (astrologer) {
      // Convert populated objects → plain name strings
      astrologer.specializations =
        astrologer.specializations?.map((s) => s.name) || [];
      astrologer.languages_spoken =
        astrologer.languages_spoken?.map((l) => l.name) || [];

      // Fetch service rates
      rates = await AstrologerServiceRates.find({
        astrologer_id: astrologer._id,
      }).lean();

      // Fetch followers count
      followersCount = await FollowRequest.countDocuments({
        astrologer_id: astrologer._id,
      });

      // Fetch rating average
      const ranking = await AstrologerRanking.findOne({
        astrologer_id: astrologer._id,
      }).lean();
      ratingsAvg = ranking?.ratings_avg || 0;
    }

    // Fetch following count
    const followingCount = await FollowRequest.countDocuments({
      user_id: userId,
    });

    return {
      user,
      astrologer,
      rates,
      role: user.role,
      followersCount,
      followingCount,
      ratingsAvg,
    };
  } catch (error) {
    logger.error("Service Error: Failed to fetch complete user profile", error);
    throw error;
  }
}

async function updateAvailabilityStatusService(userId, statusData) {
  try {
    logger.info(
      `[AvailabilityService] Updating status for astrologer userId=${userId}`,
      statusData,
    );

    const astrologer = await Astrologer.findOne({ user_id: userId });
    if (!astrologer) {
      throw new Error("Astrologer profile not found");
    }

    const { is_online, isChat, isCall, isVideo } = statusData;

    const updatePayload = {
      is_online: !!is_online,
      isChat: false,
      isCall: false,
      isVideo: false,
      is_busy: !is_online,
    };

    if (is_online === true) {
      if (typeof isChat === "boolean") updatePayload.isChat = isChat;
      if (typeof isCall === "boolean") updatePayload.isCall = isCall;
      if (typeof isVideo === "boolean") updatePayload.isVideo = isVideo;
    }

    const updated = await Astrologer.findByIdAndUpdate(
      astrologer._id,
      { $set: updatePayload },
      { new: true },
    );

    await CacheService.clearMatchingKeys(ASTROLOGER_CACHE_PREFIX);

    const emitPayload = {
      astrologer_user_id: userId,
      is_online: updated.is_online,
      isChat: updated.isChat,
      isCall: updated.isCall,
      isVideo: updated.isVideo,
    };

    emitAstrologerAvailability(emitPayload);

    logger.info(
      `[AvailabilityService] Status updated and emitted for astrologer userId=${userId}`,
      emitPayload,
    );

    return emitPayload;
  } catch (error) {
    logger.error(
      `[AvailabilityService] Failed to update status for astrologer userId=${userId}`,
      error,
    );
    throw error;
  }
}

async function getAvailabilityStatusService(userId) {
  try {
    const astrologer = await Astrologer.findOne({ user_id: userId }).lean();
    if (!astrologer) {
      throw new Error("Astrologer profile not found");
    }

    return {
      is_online: astrologer.is_online,
      isChat: astrologer.isChat,
      isCall: astrologer.isCall,
      isVideo: astrologer.isVideo,
    };
  } catch (error) {
    logger.error("Service Error: Failed to get availability status", error);
    throw error;
  }
}
async function updateAstrologerRatingAvg(astrologerUserId) {
  if (!astrologerUserId) return;

  try {
    logger.info(
      `[updateAstrologerRatingAvg] Start updating for user_id: ${astrologerUserId}`,
    );
    const feedbacks = await Feedback.find({
      astrologer_user_id: astrologerUserId,
      source_type: {
        $in: [Enums.ENTITY.TYPE.SESSION, Enums.ENTITY.TYPE.POOJA_BOOKING],
      },
      rating: { $ne: null },
    }).select("rating");
    let avg = 0;
    if (feedbacks.length > 0) {
      avg = calculateAverageRating(feedbacks);
    }
    const astrologer = await Astrologer.findOne({
      user_id: astrologerUserId,
    }).select("_id");
    if (!astrologer) {
      logger.warn(
        `[updateAstrologerRatingAvg] Astrologer not found for user_id: ${astrologerUserId}`,
      );
      return;
    }
    const updated = await AstrologerRanking.findOneAndUpdate(
      { astrologer_id: astrologer._id },
      { ratings_avg: avg },
      { upsert: true, new: true },
    );
    await CacheService.clearMatchingKeys(ASTROLOGER_CACHE_PREFIX);
    logger.info(
      `[updateAstrologerRatingAvg] Updated ratings_avg=${avg} for astrologer_id=${astrologer._id}`,
    );
  } catch (err) {
    logger.error("[updateAstrologerRatingAvg] Error:", err);
  }
}
function calculateAverageRating(feedbacks) {
  if (!feedbacks || feedbacks.length === 0) return 0;
  const total = feedbacks.reduce((sum, fb) => sum + (fb.rating || 0), 0);
  const rawAvg = total / feedbacks.length;
  const rounded = Math.round(rawAvg * 2) / 2;
  return Math.min(5.0, Math.max(1.0, rounded));
}

module.exports = {
  createOrUpdateAstrologer,
  fetchAstrologerFromUser,
  createOrUpdateRate,
  fetchCompleteUserProfile,
  updateAvailabilityStatusService,
  getAvailabilityStatusService,
  updateAstrologerRatingAvg,
  calculateAverageRating,
};
