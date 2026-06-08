const Astrologer = require("../../models/Astrologer");
const AstrologerRanking = require("../../models/AstrologerRanking");
const AstrologerServiceRates = require("../../models/AstrologerServiceRates");
const Feedback = require("../../models/Feedback");
const FollowRequest = require("../../models/FollowRequest");
const User = require("../../models/User");
const Enums = require("../../utils/constants");
const logger = require("../../utils/logger");
const CacheService = require("../../utils/redis/cacheService");
const astrologerOfferService = require("../astrologer/astrologerOfferService");
const {
  emitAstrologerAvailability,
} = require("../socket/handleAstrologerEvents");
const {
  markAstrologerOnline,
  markAstrologerOffline,
} = require("../../utils/astrologerActivity");

const ASTROLOGER_CACHE_PREFIX = "astro:list";

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
    console.log(profileData.profilePicture);
    if (profileData.profilePicture) {
      await User.findByIdAndUpdate(userId, {
        $set: { profilePicture: profileData.profilePicture },
      });
      logger.info(`User profile picture synced | userId=${userId}`);
    }
    console;
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

async function fetchCompleteUserProfile(userId) {
  try {
    logger.info(`Fetching complete user profile | userId=${userId}`);
    const user = await User.findById(userId)
      .select(
        "name mobileNumber countryCode email role smallProfilePicture profilePicture gender",
      )
      .lean();

    if (!user) throw new Error("User not found");
    let astrologer = null;
    let rates = [];
    let followersCount = 0;
    let ratingsAvg = 0;
    const astrologerData = await Astrologer.findOne(
      { user_id: userId },
      {
        display_name: 1,
        bio: 1,
        experience_years: 1,
        is_online: 1,
        is_busy: 1,
        isChat: 1,
        isCall: 1,
        isVideo: 1,
        specializations: 1,
        languages_spoken: 1,
      },
    )
      .populate("specializations", "name")
      .populate("languages_spoken", "name")
      .lean();

    if (astrologerData) {
      const specializations =
        astrologerData.specializations?.map((s) => s.name) || [];

      const languages_spoken =
        astrologerData.languages_spoken?.map((l) => l.name) || [];

      let rawRates = await AstrologerServiceRates.find(
        { astrologer_id: astrologerData._id },
        {
          service_type: 1,
          rate: 1,
          commission_pct: 1,
        },
      ).lean();

      rawRates = await astrologerOfferService.applyOffersOnRates(
        astrologerData._id,
        rawRates,
      );

      rates = rawRates.map((r) => ({
        service_type: r.service_type,
        rate: r.rate,
        final_rate: r.final_rate,
        is_offer_applied: r.discount_applied,
        commission_pct: r.commission_pct,
      }));

      followersCount = await FollowRequest.countDocuments({
        astrologer_id: astrologerData._id,
      });

      const ranking = await AstrologerRanking.findOne(
        { astrologer_id: astrologerData._id },
        { ratings_avg: 1 },
      ).lean();

      ratingsAvg = ranking?.ratings_avg || 0;

      astrologer = {
        _id: astrologerData._id,
        display_name: astrologerData.display_name,
        bio: astrologerData.bio,
        experience_years: astrologerData.experience_years,
        is_online: astrologerData.is_online,
        is_busy: astrologerData.is_busy,
        isChat: astrologerData.isChat,
        isCall: astrologerData.isCall,
        isVideo: astrologerData.isVideo,
        specializations,
        languages_spoken,
      };
    }

    const followingCount = await FollowRequest.countDocuments({
      user_id: userId,
    });

    return {
      user: {
        _id: user._id,
        name: user.name,
        mobileNumber: user.mobileNumber,
        countryCode: user.countryCode,
        email: user.email,
        role: user.role,
        gender: user.gender,
        profilePicture: user.profilePicture || null,
      },
      astrologer,
      rates,
      followersCount,
      followingCount,
      ratingsAvg,
    };
  } catch (error) {
    logger.error("Service Error: Failed to fetch complete user profile", error);
    throw error;
  }
}

function runInBackground(fn) {
  setImmediate(async () => {
    try {
      await fn();
    } catch (error) {
      logger.error(
        "[Background Job Error]",
        error
      );
    }
  });
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

    const previousOnlineStatus = astrologer.is_online;

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

    if (!previousOnlineStatus && updated.is_online) {
      runInBackground(() => markAstrologerOnline(updated._id));
    }

    if (previousOnlineStatus && !updated.is_online) {
      runInBackground(() => markAstrologerOffline(updated._id));
    }

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
