const service = require("../../services/admin/setAstrologerPriorityService");
const asyncHandler = require("../../middlewares/asyncHandler");
const userService = require("../../services/admin/setAstrologerPriorityService");
const logger = require("../../utils/logger");
const Enums = require("../../utils/constants");
const {
  getAllSpecializations,
  getAllLanguages,
} = require("../../services/admin/AstrologerSkillsService");
const CacheService = require("../../utils/redis/cacheService");
const { Types } = require("mongoose");
const {
  checkAstrologerBusy,
} = require("../../utils/redis/sessionCacheService");
exports.addAstrologerPriority = async (req, res) => {
  try {
    const { astrologer_ids } = req.body;
    const adminId = req.user._id;

    const data = await service.addAstrologerPriority({
      astrologer_ids,
      adminId,
    });

    res.json({
      success: true,
      message: "Astrologer(s) added successfully",
      data,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

exports.updateAstrologerPriority = async (req, res) => {
  try {
    const { astrologer_ids } = req.body;
    const adminId = req.user._id;

    if (!astrologer_ids || !astrologer_ids.length) {
      return res.status(400).json({
        success: false,
        message: "astrologer_ids is required",
      });
    }

    const data = await service.updateAstrologerPriority({
      astrologer_ids,
      adminId,
    });

    return res.json({
      success: true,
      message: "Astrologer priority updated successfully",
      data,
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

exports.fetchAllPrioritizedAstrologers = async (req, res) => {
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

    // req.user is undefined when there's no token (e.g. public home page).
    const userId = req.user?._id || null;
    const role = req.user?.role || null; // ← NEW: needed for SUPER_ADMIN bypass

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
      ...(minRating && {
        ratings_avg: { $gte: parseFloat(minRating) },
      }),
      "service_rates.service_type": targetServiceType,
      ...(is_free !== undefined && { is_free: is_free === "true" }),
    };
    const { data: staticAstrologers, pagination } = await service.fetchAll({
      limit: parsedLimit,
      cursor,
      filters,
      sortPrice,
      sortExperience,
      sortRating,
      gender,
      search,
      userId,
      role, // ← NEW: passed through so the service can apply SUPER_ADMIN bypass
      targetServiceType,
    });

    /* ===== CACHE: SPECIALIZATIONS ===== */
    let cachedSpecializations = await CacheService.get(
      CacheService.CACHE_PREFIXES.USERS_LIST + ":specializations",
    );

    if (!cachedSpecializations) {
      cachedSpecializations = await getAllSpecializations({
        page: 1,
        limit: 1000,
      });

      await CacheService.set(
        CacheService.CACHE_PREFIXES.USERS_LIST + ":specializations",
        cachedSpecializations,
      );
    }

    /* ===== CACHE: LANGUAGES ===== */
    let cachedLanguages = await CacheService.get(
      CacheService.CACHE_PREFIXES.USERS_LIST + ":languages",
    );

    if (!cachedLanguages) {
      cachedLanguages = await getAllLanguages({
        page: 1,
        limit: 1000,
      });

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
          // promotion key already attached by service.fetchAll — passed through as-is
          promotion: astro.promotion,
        };
      }),
    );

    return res.status(200).json({
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
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
