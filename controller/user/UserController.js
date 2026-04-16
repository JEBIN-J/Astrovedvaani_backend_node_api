const { deleteUser } = require("../../services/admin/adminUserService");
const userService = require("../../services/user/userService");
const chatService = require("../../services/user/chatService");
const logger = require("../../utils/logger");
const asyncHandler = require("../../middlewares/asyncHandler");
const {
  checkAstrologerBusy,
} = require("../../utils/redis/sessionCacheService");
const Language = require("../../models/Language");
const Specialization = require("../../models/Specialization");
const CacheService = require("../../utils/redis/cacheService");
const { Types } = require("mongoose");
const Enums = require("../../utils/constants");
const {
  getAllSpecializations,
  getAllLanguages,
} = require("../../services/admin/AstrologerSkillsService");

exports.getAstrologers = asyncHandler(async (req, res) => {
  try {
    const {
      limit = 10,
      cursor = null,
      is_online,
      is_busy,
      is_premium,
      languages,
      specializations,
      minRating,
      serviceType,
      sortPrice, // asc | desc
      sortExperience, // asc | desc
      sortRating, // asc | desc
      gender,
      is_free,
      search,
    } = req.query;

    const userId = req.user?._id || null;
    const parsedLimit = Math.min(Number(limit), 50);
    if (isNaN(parsedLimit)) {
      return res.status(400).json({
        success: false,
        message: "Invalid limit parameter",
      });
    }
    const targetServiceType = serviceType
      ? parseInt(serviceType)
      : Enums.SERVICE.TYPE.CHAT;
    const filters = {
      ...(is_online !== undefined && {
        "astrologer.is_online": is_online === "true",
      }),
      ...(is_busy !== undefined && {
        "astrologer.is_busy": is_busy === "true",
      }),
      ...(is_premium !== undefined && {
        "astrologer.is_premium": is_premium === "true",
      }),
      ...(languages && {
        "astrologer.languages_spoken": {
          $in: languages.split(",").map((id) => new Types.ObjectId(id)),
        },
      }),
      ...(specializations && {
        "astrologer.specializations": {
          $in: specializations.split(",").map((id) => new Types.ObjectId(id)),
        },
      }),
      ...(minRating && { ratings_avg: { $gte: parseFloat(minRating) } }),
      "service_rates.service_type": targetServiceType, // Filter by service type
      ...(is_free !== undefined && { is_free: is_free === "true" }),
    };

    const { data: staticAstrologers, pagination } =
      await userService.fetchAstrologers({
        limit: parsedLimit,
        cursor,
        filters,
        sortPrice,
        sortExperience,
        sortRating,
        gender,
        search,
        userId,
        targetServiceType,
      });
    let cachedSpecializations = await CacheService.get(
      CacheService.CACHE_PREFIXES.USERS_LIST + ":specializations",
    );
    if (!cachedSpecializations) {
      cachedSpecializations = await getAllSpecializations({
        page: 1,
        limit: 1000,
      }); // fetch all for cache
      await CacheService.set(
        CacheService.CACHE_PREFIXES.USERS_LIST + ":specializations",
        cachedSpecializations,
      );
    }

    let cachedLanguages = await CacheService.get(
      CacheService.CACHE_PREFIXES.USERS_LIST + ":languages",
    );
    if (!cachedLanguages) {
      cachedLanguages = await getAllLanguages({ page: 1, limit: 1000 });
      await CacheService.set(
        CacheService.CACHE_PREFIXES.USERS_LIST + ":languages",
        cachedLanguages,
      );
    }
    const populatedData = await Promise.all(
      staticAstrologers.map(async (astro) => {
        const specializationsPop = astro.astrologer.specializations
          .map((id) => {
            const s = cachedSpecializations?.data?.find(
              (x) => x._id.toString() === id.toString(),
            );
            return s ? s.name : null;
          })
          .filter(Boolean);

        const languagesPop = astro.astrologer.languages_spoken
          .map((id) => {
            const l = cachedLanguages?.data?.find(
              (x) => x._id.toString() === id.toString(),
            );
            return l ? l.name : null;
          })
          .filter(Boolean);

        const isBusy = await checkAstrologerBusy(astro.astrologer.user_id);

        return {
          ...astro,
          astrologer: {
            ...astro.astrologer,
            specializations: specializationsPop,
            languages_spoken: languagesPop,
            is_busy: isBusy,
          },
        };
      }),
    );

    res.status(200).json({
      success: true,
      data: populatedData,
      meta: {
        count: populatedData.length,
        pagination: {
          next_cursor: pagination.nextCursor,
          has_more: pagination.hasMore,
          limit: parsedLimit,
        },
      },
    });
  } catch (error) {
    logger.error("Failed to get astrologers", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

exports.getAstrologerById = async (req, res) => {
  try {
    const { astrologerId } = req.query;
    const userId = req.user?._id || null;

    if (!astrologerId) {
      return res.status(400).json({
        success: false,
        message: "Astrologer ID is required",
      });
    }

    const result = await userService.fetchAstrologerById(astrologerId, userId);
    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Astrologer not found",
      });
    }

    // Load cached languages and specializations
    const cachedSpecializations = await CacheService.get(
      CacheService.CACHE_PREFIXES.USERS_LIST + ":specializations",
    );
    const cachedLanguages = await CacheService.get(
      CacheService.CACHE_PREFIXES.USERS_LIST + ":languages",
    );

    // Populate names from cache
    const specializationsPop = result.astrologer.specializations
      .map((id) => {
        const s = cachedSpecializations?.data?.find(
          (x) => x._id.toString() === id.toString(),
        );
        return s ? s.name : null;
      })
      .filter(Boolean);

    const languagesPop = result.astrologer.languages_spoken
      .map((id) => {
        const l = cachedLanguages?.data?.find(
          (x) => x._id.toString() === id.toString(),
        );
        return l ? l.name : null;
      })
      .filter(Boolean);

    const isBusy = await checkAstrologerBusy(result.astrologer.user_id);

    const populatedResult = {
      ...result,
      astrologer: {
        ...result.astrologer,
        specializations: specializationsPop,
        languages_spoken: languagesPop,
        is_busy: isBusy,
      },
    };

    return res.status(200).json({
      success: true,
      data: populatedResult,
    });
  } catch (error) {
    logger.error("Error fetching astrologer by ID:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
exports.getReviewsByAstrologerId = async (req, res) => {
  try {
    const { astrologerId } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const result = await userService.getReviewsByAstrologerId(
      astrologerId,
      page,
      limit,
    );

    if (!result) {
      return res.status(404).json({
        message: "Astrologer not found",
      });
    }

    res.status(200).json({
      message: "Reviews fetched successfully",
      data: {
        reviews: result.reviews,
        pagination: result.pagination,
        averageRating: result.averageRating,
        totalReviewers: result.totalReviewers,
        ratingBreakdown: result.ratingBreakdown,
      },
    });
  } catch (error) {
    console.error("Error fetching reviews:", error);
    res.status(500).json({
      message: "Internal server error",
    });
  }
};
exports.deleteUser = async (req, res) => {
  try {
    const { userId } = req.user._id;
    await deleteUser(userId);
    return res.status(200).json({ success: true });
  } catch (err) {
    logger.error("deleteUser error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};
exports.toggleFollowAstrologer = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const astrologerId = req.query.astrologerId;
  const result = await userService.toggleFollowAstrologer(userId, astrologerId);
  return res.status(200).json({
    success: true,
    message: result.followed
      ? "Followed successfully"
      : "Unfollowed successfully",
    data: result,
  });
});
exports.getUserFollows = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "User ID required" });
    }

    const { limit = 20, cursor = null } = req.query;

    const { data, pagination } = await userService.fetchUserFollows(userId, {
      limit: Number(limit),
      cursor,
    });

    res.status(200).json({
      success: true,
      data,
      meta: {
        count: data.length,
        pagination,
      },
    });
  } catch (error) {
    logger.error("Failed to get user follows", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

exports.getChatList = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { page = 1, limit = 20 } = req.query;

  const result = await chatService.getChatList(
    userId,
    parseInt(page, 10),
    parseInt(limit, 10),
  );

  res.status(200).json({ success: true, ...result });
});
exports.getConversation = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { otherUserId, sessionId } = req.query;
  const { page = 1, limit = 20 } = req.query;

  const result = await chatService.getConversation(
    userId,
    otherUserId,
    sessionId,
    parseInt(page, 10),
    parseInt(limit, 10),
  );
  res.status(200).json({ success: true, ...result });
});

exports.globalSearch = asyncHandler(async (req, res) => {
  const query = req.query.key;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;

  if (!query) {
    throw new BadRequestError("Search query is required");
  }

  const results = await userService.globalSearch(query, page, limit);

  res.status(200).json({
    success: true,
    message: "Search results fetched successfully",
    data: results,
  });
});
