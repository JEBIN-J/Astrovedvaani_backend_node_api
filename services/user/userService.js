const mongoose = require("mongoose");
const AstrologerRanking = require("../../models/AstrologerRanking");
const Astrologer = require("../../models/Astrologer");
const Feedback = require("../../models/Feedback");

const CacheService = require("../../utils/redis/cacheService");
const logger = require("../../utils/logger");
const User = require("../../models/User");
const AstrologerServiceRates = require("../../models/AstrologerServiceRates");
const { buildPaginationResponse } = require("../../utils/pagination");
const FollowRequest = require("../../models/FollowRequest");
const { BadRequestError } = require("../../errors");
const Product = require("../../models/Product");
const Pooja = require("../../models/Pooja");
const {
  checkAstrologerBusy,
} = require("../../utils/redis/sessionCacheService");
const Enums = require("../../utils/constants");
const AstrologerOfferSchema = require("../../models/AstrologerOfferSchema");
const { ASTROLOGERS_LIST } = CacheService.CACHE_PREFIXES;

const ASTRO_BUSY_PREFIX = "astro:busy:";

function getServicePriority(astrologer) {
  const chat = astrologer.isChat ? 4 : 0;

  const call = astrologer.isCall ? 2 : 0;

  const video = astrologer.isVideo ? 1 : 0;

  return chat + call + video;
}

function getOnlinePriority(astrologer) {
  // ONLINE + FREE

  if (astrologer.is_online && !astrologer.is_busy) {
    return 3;
  }

  // BUSY

  if (astrologer.is_busy) {
    return 2;
  }

  // OFFLINE

  return 1;
}

function encodeCursor(item) {
  return Buffer.from(
    JSON.stringify({
      online_priority: item.online_priority,

      service_priority: item.service_priority,

      score: item.score,

      _id: item._id,
    }),
  ).toString("base64");
}

function decodeCursor(cursor) {
  try {
    return JSON.parse(Buffer.from(cursor, "base64").toString());
  } catch {
    return null;
  }
}

async function getBusyAstrologersMap(astrologerUserIds = []) {
  try {
    if (!astrologerUserIds.length) {
      return new Map();
    }

    const pipeline = redisClient.multi();

    astrologerUserIds.forEach((id) => {
      pipeline.get(`${ASTRO_BUSY_PREFIX}${id}`);
    });

    const results = await pipeline.exec();

    const busyMap = new Map();

    astrologerUserIds.forEach((id, index) => {
      busyMap.set(id.toString(), !!results[index]);
    });

    return busyMap;
  } catch (err) {
    logger.error("Error fetching busy astrologers", err);

    return new Map();
  }
}

exports.fetchAstrologers = async ({
  limit = 20,
  cursor = null,
  filters = {},
  sortPrice,
  sortExperience,
  sortRating,
  gender,
  userId,
  search,
}) => {
  try {
    let serviceTypeFilter = filters["service_rates.service_type"];

    let isFreeFilter = undefined;

    const rankingFilters = {};

    const astrologerMatchFilters = {};

    Object.entries(filters).forEach(([key, value]) => {
      if (key === "service_rates.service_type") {
        serviceTypeFilter = value;
      } else if (key === "is_free") {
        isFreeFilter = value;
      } else if (key.startsWith("astrologer.")) {
        astrologerMatchFilters[key.replace("astrologer.", "")] = value;
      } else {
        rankingFilters[key] = value;
      }
    });

    const aggregationPipeline = [];

    aggregationPipeline.push(
      {
        $match: rankingFilters,
      },

      {
        $lookup: {
          from: "astrologers",
          localField: "astrologer_id",
          foreignField: "_id",
          as: "astrologer",
        },
      },

      {
        $unwind: "$astrologer",
      },

      ...(Object.keys(astrologerMatchFilters).length
        ? [
            {
              $match: Object.fromEntries(
                Object.entries(astrologerMatchFilters).map(([k, v]) => [
                  `astrologer.${k}`,
                  v,
                ]),
              ),
            },
          ]
        : []),

      {
        $lookup: {
          from: "users",
          localField: "astrologer.user_id",
          foreignField: "_id",
          as: "user",
        },
      },

      {
        $unwind: {
          path: "$user",
          preserveNullAndEmptyArrays: true,
        },
      },

      {
        $match: {
          "user.isDeleted": false,

          "user.verificationStatus": Enums.USER.VERIFICATION_STATUS.APPROVED,
        },
      },

      ...(gender
        ? [
            {
              $match: {
                "user.gender": parseInt(gender),
              },
            },
          ]
        : []),

      {
        $lookup: {
          from: "astrologerservicerates",
          localField: "astrologer._id",
          foreignField: "astrologer_id",
          as: "service_rates",
        },
      },

      {
        $match: {
          service_rates: {
            $ne: [],
            $exists: true,
          },
        },
      },

      ...(serviceTypeFilter !== null
        ? [
            {
              $match: {
                service_rates: {
                  $elemMatch: {
                    service_type: serviceTypeFilter,
                  },
                },
              },
            },
          ]
        : []),

      {
        $lookup: {
          from: "consultationsessions",
          localField: "astrologer.user_id",
          foreignField: "astrologer_user_id",
          as: "sessions",
        },
      },

      ...(isFreeFilter !== undefined
        ? [
            {
              $match: {
                "sessions.is_free": isFreeFilter,
              },
            },
          ]
        : []),
    );

    // SEARCH

    if (search) {
      aggregationPipeline.push({
        $match: {
          $or: [
            {
              "astrologer.display_name": {
                $regex: search,
                $options: "i",
              },
            },

            {
              "user.name": {
                $regex: search,
                $options: "i",
              },
            },

            {
              "astrologer.bio": {
                $regex: search,
                $options: "i",
              },
            },
          ],
        },
      });
    }

    aggregationPipeline.push({
      $project: {
        _id: 1,

        ratings_avg: 1,

        score: 1,

        astrologer: {
          $mergeObjects: [
            "$astrologer",

            {
              display_name: {
                $ifNull: ["$astrologer.display_name", "$user.name"],
              },

              profilePicture: {
                $ifNull: ["$user.profilePicture", null],
              },
            },
          ],
        },

        user: 1,

        service_rates: 1,
      },
    });

    // FETCH EXTRA FOR REDIS SORTING

    aggregationPipeline.push({
      $limit: 500,
    });

    const result = await AstrologerRanking.aggregate(aggregationPipeline);

    // REDIS BULK FETCH

    const astrologerUserIds = result.map((r) =>
      r.astrologer.user_id.toString(),
    );

    const busyMap = await getBusyAstrologersMap(astrologerUserIds);

    console.log("Busy Map:", busyMap);

    let formattedData = result.map((r) => {
      const isBusy = busyMap.get(r.astrologer.user_id.toString());

      console.log(`Astrologer ${r.astrologer._id} busy status:`, isBusy);

      const astrologerData = {
        ...r.astrologer,

        is_busy: isBusy,

        services: {
          chat: r.astrologer.isChat || false,

          call: r.astrologer.isCall || false,

          video: r.astrologer.isVideo || false,
        },
      };

      return {
        _id: r._id,

        ratings_avg: r.ratings_avg || 0,

        astrologer: astrologerData,

        user: r.user || null,

        service_rates: r.service_rates || [],

        score: r.score || 0,

        online_priority: getOnlinePriority(astrologerData),

        service_priority: getServicePriority(astrologerData),
      };
    });

    console.log("Formatted Data Sample:", formattedData[0]);

    // FILTER BUSY

    if (filters["astrologer.is_busy"] !== undefined) {
      formattedData = formattedData.filter(
        (item) => item.astrologer.is_busy === filters["astrologer.is_busy"],
      );
    }

    // FINAL SORT

    formattedData.sort((a, b) => {
      // ONLINE > BUSY > OFFLINE

      if (b.online_priority !== a.online_priority) {
        return b.online_priority - a.online_priority;
      }

      // SERVICES

      if (b.service_priority !== a.service_priority) {
        return b.service_priority - a.service_priority;
      }

      // PREMIUM

      if (b.astrologer.is_premium !== a.astrologer.is_premium) {
        return (
          Number(b.astrologer.is_premium) - Number(a.astrologer.is_premium)
        );
      }

      // RATING

      if (b.ratings_avg !== a.ratings_avg) {
        return b.ratings_avg - a.ratings_avg;
      }

      // SCORE

      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return String(a._id).localeCompare(String(b._id));
    });

    // CURSOR FILTER

    if (cursor) {
      const decoded = decodeCursor(cursor);

      if (decoded) {
        formattedData = formattedData.filter((item) => {
          if (item.online_priority < decoded.online_priority) return true;

          if (
            item.online_priority === decoded.online_priority &&
            item.service_priority < decoded.service_priority
          )
            return true;

          if (
            item.online_priority === decoded.online_priority &&
            item.service_priority === decoded.service_priority &&
            item.score < decoded.score
          )
            return true;

          if (
            item.online_priority === decoded.online_priority &&
            item.service_priority === decoded.service_priority &&
            item.score === decoded.score &&
            String(item._id) > String(decoded._id)
          )
            return true;

          return false;
        });
      }
    }

    // FINAL PAGINATION

    const paginatedData = formattedData.slice(0, limit);

    console.log("Paginated Data", paginatedData);

    const hasMore = formattedData.length > limit;

    const nextCursor =
      hasMore && paginatedData.length
        ? encodeCursor(paginatedData[paginatedData.length - 1])
        : null;

    // FOLLOW INFO

    if (userId) {
      const astroIds = paginatedData.map((r) => r.astrologer._id);

      const follows = await FollowRequest.find({
        user_id: userId,

        astrologer_id: {
          $in: astroIds,
        },
      }).select("astrologer_id");

      const followedSet = new Set(
        follows.map((f) => f.astrologer_id.toString()),
      );

      paginatedData.forEach((item) => {
        item.isFollow = followedSet.has(item.astrologer._id.toString());
      });
    } else {
      paginatedData.forEach((item) => {
        item.isFollow = false;
      });
    }


    return {
      data: paginatedData,

      pagination: {
        hasMore,
        nextCursor,
      },
    };
  } catch (err) {
    logger.error(`Error fetching astrologers: ${err.message}`);

    return {
      data: [],

      pagination: {
        hasMore: false,
        nextCursor: null,
      },
    };
  }
};

exports.fetchAstrologerById = async (id, userId) => {
  try {
    const astrologer = await Astrologer.findById(id).lean();
    if (!astrologer) return null;
    const [user, ranking, service_rates, followerCount] = await Promise.all([
      User.findById(astrologer.user_id).lean(),
      AstrologerRanking.findOne({ astrologer_id: id }).lean(),
      AstrologerServiceRates.find({ astrologer_id: id }).lean(),
      FollowRequest.countDocuments({
        astrologer_id: id,
        status: Enums.SERVICE.FOLLOW.ACCEPTED,
      }),
    ]);
    let isFollow = false;
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      const follow = await FollowRequest.findOne({
        user_id: userId,
        astrologer_id: id,
        status: Enums.SERVICE.FOLLOW.ACCEPTED,
      }).lean();
      isFollow = !!follow;
    }

    return {
      ratings_avg: ranking?.ratings_avg || 0,
      astrologer,
      user,
      service_rates,
      isFollow,
      follower_count: followerCount,
    };
  } catch (err) {
    logger.error("Error in fetchAstrologerById:", err);
    return null;
  }
};
exports.getReviewsByAstrologerId = async (astrologerId, page, limit) => {
  try {
    logger.info("Input Params", { astrologerId, page, limit });
    const skip = (page - 1) * limit;
    const astrologer = await Astrologer.findById(astrologerId).lean();
    logger.info("Astrologer Found", astrologer);
    if (!astrologer) {
      logger.warn("Astrologer not found for ID", astrologerId);
      return null;
    }
    const geoUserId = astrologer.user_id;
    const astroUserObjectId = new mongoose.Types.ObjectId(geoUserId);
    logger.info("Astrologer User ID (used in Feedback)", astroUserObjectId);
    const query = { astrologer_user_id: astroUserObjectId, is_visible: true };
    const [reviews, totalDocs, rankingData, stats] = await Promise.all([
      Feedback.find(query)
        .sort({ reviewed_at: -1 })
        .skip(skip)
        .limit(limit)
        .populate({
          path: "user_id",
          select: "name profile_image",
          options: { strictPopulate: false },
        })
        .lean(),

      Feedback.countDocuments(query),
      AstrologerRanking.findOne({ astrologer_id: astrologer._id }).lean(),
      Feedback.aggregate([
        { $match: query },
        {
          $facet: {
            ratingsCount: [
              {
                $group: {
                  _id: "$rating",
                  count: { $sum: 1 },
                },
              },
            ],
            uniqueUserCount: [
              {
                $group: {
                  _id: "$user_id",
                },
              },
              {
                $count: "totalUsers",
              },
            ],
          },
        },
      ]),
    ]);
    if (reviews.length === 0 && totalDocs > 0) {
      logger.warn(
        "Reviews count mismatch: documents exist but not fetched. Check population/lean.",
      );
    }
    const totalPages = Math.ceil(totalDocs / limit);
    const statData = stats[0] || {};
    const ratingBreakdown = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };
    if (statData.ratingsCount) {
      statData.ratingsCount.forEach((item) => {
        ratingBreakdown[item._id] = item.count;
      });
    }
    return {
      reviews,
      pagination: buildPaginationResponse({
        totalDocs,
        totalPages,
        page,
        limit,
      }),
      averageRating: rankingData?.ratings_avg || 0,
      totalReviewers: totalDocs,
      ratingBreakdown,
    };
  } catch (error) {
    logger.error("Error in getReviewsByAstrologerId", error);
    throw error;
  }
};

exports.toggleFollowAstrologer = async (userId, astrologerId) => {
  if (!mongoose.Types.ObjectId.isValid(astrologerId)) {
    throw new BadRequestError("Invalid astrologer ID format");
  }
  const existingFollow = await FollowRequest.findOne({
    user_id: userId,
    astrologer_id: astrologerId,
  });
  if (existingFollow) {
    await FollowRequest.deleteOne({ _id: existingFollow._id });
    await CacheService.clearMatchingKeys(
      CacheService.CACHE_PREFIXES.ASTROLOGERS_LIST,
    );
    return { followed: false };
  }
  const isAstroValid = await Astrologer.findById(astrologerId);
  if (!isAstroValid) {
    throw new BadRequestError("Astrologer does not exist");
  }
  const follow = await FollowRequest.create({
    user_id: userId,
    astrologer_id: astrologerId,
  });
  await CacheService.clearMatchingKeys(
    CacheService.CACHE_PREFIXES.ASTROLOGERS_LIST,
  );
  return { followed: true, follow };
};

exports.fetchUserFollows = async (
  userId,
  { limit = 20, cursor = null } = {},
) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error("Invalid userId");
    }
    const query = { user_id: userId };
    if (cursor) {
      query._id = { $gt: cursor };
    }
    const follows = await FollowRequest.find(query)
      .limit(limit + 1)
      .lean();
    const hasMore = follows.length > limit;
    const slicedFollows = hasMore ? follows.slice(0, -1) : follows;
    const astrologerIds = slicedFollows.map((f) => f.astrologer_id);
    const astrologers = await Astrologer.find({
      _id: { $in: astrologerIds },
    }).lean();
    const users = await User.find({
      _id: { $in: astrologers.map((a) => a.user_id) },
      isDeleted: false,
      verificationStatus: Enums.USER.VERIFICATION_STATUS.APPROVED,
    }).lean();
    const serviceRates = await AstrologerServiceRates.find({
      astrologer_id: { $in: astrologerIds },
    }).lean();
    const astrologerMap = astrologers.reduce((acc, a) => {
      acc[a._id.toString()] = a;
      return acc;
    }, {});
    const userMap = users.reduce((acc, u) => {
      acc[u._id.toString()] = u;
      return acc;
    }, {});
    const serviceRateMap = serviceRates.reduce((acc, sr) => {
      const astroId = sr.astrologer_id.toString();
      if (!acc[astroId]) acc[astroId] = [];
      acc[astroId].push(sr);
      return acc;
    }, {});
    const data = slicedFollows
      .map((f) => {
        const astrologer = astrologerMap[f.astrologer_id.toString()] || null;
        const astroUser = astrologer
          ? userMap[astrologer.user_id.toString()] || null
          : null;
        return {
          astrologer,
          user: astroUser,
          service_rates: serviceRateMap[f.astrologer_id.toString()] || [],
          isFollow: true,
        };
      })
      .filter((item) => item.user !== null);
    const nextCursor = hasMore
      ? slicedFollows[slicedFollows.length - 1]._id
      : null;
    return { data, pagination: { hasMore, nextCursor } };
  } catch (err) {
    logger.error("Error fetching user follows:", err);
    return { data: [], pagination: { hasMore: false, nextCursor: null } };
  }
};

exports.globalSearch = async (query, page = 1, limit = 10) => {
  if (!query || typeof query !== "string") {
    throw new BadRequestError("Invalid search query");
  }

  const cacheKey = CacheService.generateKey(
    CacheService.CACHE_PREFIXES.SEARCH_RESULTS || "search:results",
    query,
    page,
    limit,
  );

  const cached = await CacheService.get(cacheKey);
  if (cached) return cached;

  const searchRegex = new RegExp(query.trim(), "i");
  const skip = (page - 1) * limit;

  // Search astrologers with active, not blocked, approved users only
  const [astrologers, astrologersCount] = await Promise.all([
    Astrologer.aggregate([
      { $match: { display_name: searchRegex } },
      {
        $lookup: {
          from: "users",
          localField: "user_id",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $match: {
          "user.isDeleted": false,
          "user.isActive": true,
          "user.isBlock": false,
          "user.verificationStatus": Enums.USER.VERIFICATION_STATUS.APPROVED,
        },
      },
      {
        $project: {
          display_name: 1,
          bio: 1,
          profilePicture: {
            $ifNull: ["$profilePicture", "$user.profilePicture"],
          },
          specializations: 1,
          languages_spoken: 1,
          experience_years: 1,
        },
      },
      { $skip: skip },
      { $limit: limit },
    ]),
    Astrologer.aggregate([
      { $match: { display_name: searchRegex } },
      {
        $lookup: {
          from: "users",
          localField: "user_id",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $match: {
          "user.isDeleted": false,
          "user.isActive": true,
          "user.isBlock": false,
          "user.verificationStatus": Enums.USER.VERIFICATION_STATUS.APPROVED,
        },
      },
      { $count: "total" },
    ]).then((res) => res[0]?.total || 0),
  ]);

  const [products, productsCount] = await Promise.all([
    Product.find({ $or: [{ name: searchRegex }] })
      .skip(skip)
      .limit(limit)
      .select("name description summary base_price selling_price media slug"),

    Product.countDocuments({ $or: [{ name: searchRegex }] }),
  ]);

  const [poojas, poojasCount] = await Promise.all([
    Pooja.find({ $or: [{ name: searchRegex }] })
      .skip(skip)
      .limit(limit)
      .select("name description image_url base_price final_price slug"),

    Pooja.countDocuments({ $or: [{ name: searchRegex }] }),
  ]);

  const result = {
    astrologer: {
      items: astrologers,
      pagination: buildPaginationResponse({
        totalDocs: astrologersCount,
        totalPages: Math.ceil(astrologersCount / limit),
        page,
        limit,
      }),
    },
    product: {
      items: products,
      pagination: buildPaginationResponse({
        totalDocs: productsCount,
        totalPages: Math.ceil(productsCount / limit),
        page,
        limit,
      }),
    },
    pooja: {
      items: poojas,
      pagination: buildPaginationResponse({
        totalDocs: poojasCount,
        totalPages: Math.ceil(poojasCount / limit),
        page,
        limit,
      }),
    },
  };

  await CacheService.set(cacheKey, result, CacheService.TTL.DEFAULT);

  return result;
};
